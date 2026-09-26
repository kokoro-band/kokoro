package com.kokoro.room;

import com.kokoro.room.project.FloorPlanJobDispatcher;
import com.kokoro.room.project.ProjectRepository;
import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProjectRevisionTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired ProjectRepository projects;
    @MockitoBean FloorPlanJobDispatcher dispatcher;

    @Test
    void revisionIncreasesEvenWhenContentsReturnToTheOriginalValue() throws Exception {
        String id = create();
        assertThat(save(id, 0)).isEqualTo(200);
        assertThat(save(id, 0)).isEqualTo(409);
        assertThat(save(id, 1)).isEqualTo(200);
        mvc.perform(get("/api/projects/{id}", id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(2));
    }

    @Test
    void twoConcurrentWritesOfTheSameRevisionCannotBothSucceed() throws Exception {
        String id = create();
        var executor = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            java.util.concurrent.Callable<Integer> write = () -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout");
                return save(id, 0);
            };
            var first = executor.submit(write);
            var second = executor.submit(write);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
            assertThat(projects.findById(id).orElseThrow().revision()).isEqualTo(1);
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void legacyWritesStillIncrementRevisionAndInvalidateEarlierRequests() throws Exception {
        String id = create();
        mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"furniture\":[]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        assertThat(save(id, 0)).isEqualTo(409);
        mvc.perform(post("/api/projects/{id}/layout/commands", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"소파 추가\",\"expectedRevision\":0}"))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"furniture\":[],\"expectedRevision\":-1}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void roomWritesShareTheRevisionAndStaleWritesDoNotChangeTheRoom() throws Exception {
        String id = create();
        var room = mapper.readTree(getClass().getResourceAsStream("/contracts/room-v2.json")).path("room");
        var request = mapper.createObjectNode().put("expectedRevision", 0).set("room", room);
        mvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        var saved = projects.findById(id).orElseThrow();
        mvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isConflict());
        assertThat(save(id, 0)).isEqualTo(409);
        assertThat(projects.findById(id).orElseThrow()).isEqualTo(saved);
    }

    @Test
    void floorPlanUpdatesPreserveFurnitureAndIgnoreObsoleteOrFinishedJobs() throws Exception {
        String id = create();
        mvc.perform(post("/api/projects/{id}/layout/commands", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"소파 추가\",\"expectedRevision\":0}"))
                .andExpect(status().isOk());
        var before = projects.findById(id).orElseThrow();
        assertThat(before.furniture()).isNotEmpty();
        jdbc.update("UPDATE projects SET floor_plan_job_id = 'current', floor_plan_status = 'PROCESSING' WHERE id = ?", id);
        assertThat(projects.updateFloorPlanStatus(id, "old", ConversionStatus.READY, 100, null, null, false)).isFalse();
        assertThat(projects.findById(id).orElseThrow().revision()).isEqualTo(before.revision());
        assertThat(projects.updateFloorPlanStatus(id, "current", ConversionStatus.READY, 100, null, null, false)).isTrue();
        var after = projects.findById(id).orElseThrow();
        assertThat(after.revision()).isEqualTo(before.revision() + 1);
        assertThat(after.furniture()).isEqualTo(before.furniture());
        assertThat(after.room()).isEqualTo(before.room());
        assertThat(projects.updateFloorPlanStatus(id, "current", ConversionStatus.PROCESSING, 25, null, null, true)).isFalse();
        assertThat(projects.findById(id).orElseThrow()).isEqualTo(after);

        // A stale whole-project write must fail before deleting any furniture.
        var stale = new RenovationProject(before.id(), before.ownerId(), before.name(), before.roomType(),
                before.dimensions(), before.room(), before.floorPlan(), List.of(), Instant.now(), before.revision() + 1);
        assertThatThrownBy(() -> projects.replace(stale)).hasMessageContaining("409");
        assertThat(projects.findById(id).orElseThrow()).isEqualTo(after);
    }

    @Test
    void uploadDispatchesOnlyAfterItsRowsAreVisibleOnAnotherConnection() throws Exception {
        String id = create();
        var reader = Executors.newSingleThreadExecutor();
        try {
            doAnswer(invocation -> {
                String jobId = invocation.getArgument(1);
                var committed = reader.submit(() -> jdbc.queryForObject(
                        "SELECT floor_plan_job_id FROM projects WHERE id = ?", String.class, id));
                assertThat(committed.get(5, TimeUnit.SECONDS)).isEqualTo(jobId);
                return null;
            }).when(dispatcher).dispatch(anyString(), anyString());
            mvc.perform(multipart("/api/projects/{id}/floor-plan", id).file(
                            new MockMultipartFile("file", "plan.pdf", "application/pdf", "sample".getBytes())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
            verify(dispatcher).dispatch(org.mockito.ArgumentMatchers.eq(id), anyString());
        } finally {
            reader.shutdownNow();
        }
    }

    @Test
    void otherOwnersCannotUseRevisionToChangeProjects() throws Exception {
        String id = create();
        jdbc.update("UPDATE projects SET owner_id = 'someone-else' WHERE id = ?", id);
        assertThat(save(id, 0)).isEqualTo(404);
        assertThat(projects.findById(id).orElseThrow().revision()).isZero();
    }

    private String create() throws Exception {
        String body = mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"버전 검사","roomType":"거실","dimensions":{"width":6,"depth":4,"height":2.4}}
                """)).andExpect(status().isCreated()).andExpect(jsonPath("$.revision").value(0))
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).path("id").asString();
    }

    private int save(String id, long revision) throws Exception {
        return mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"furniture\":[],\"expectedRevision\":" + revision + "}"))
                .andReturn().getResponse().getStatus();
    }
}
