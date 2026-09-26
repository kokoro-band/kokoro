package com.kokoro.room;

import com.kokoro.room.project.FloorPlanJobDispatcher;
import com.kokoro.room.project.FloorPlanJobProcessor;
import com.kokoro.room.project.FloorPlanJobRecovery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FloorPlanJobStabilityTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @TempDir static Path storage;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("app.floor-plan-storage-root", () -> storage.toString());
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired FloorPlanJobProcessor processor;
    @Autowired FloorPlanJobRecovery recovery;
    @MockitoBean FloorPlanJobDispatcher dispatcher;

    @Test
    void onlyOneConcurrentUploadStartsAndRejectedFileIsRemoved() throws Exception {
        String projectId = createProject("동시 업로드");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        var executor = Executors.newFixedThreadPool(2);
        try {
            var requests = List.of("first.pdf", "second.pdf").stream().map(fileName -> executor.submit(() -> {
                ready.countDown();
                start.await();
                return upload(projectId, fileName);
            })).toList();
            ready.await();
            start.countDown();

            List<Integer> statuses = requests.stream().map(request -> {
                try {
                    return request.get().getResponse().getStatus();
                } catch (Exception exception) {
                    throw new RuntimeException(exception);
                }
            }).sorted().toList();
            assertEquals(List.of(200, 409), statuses);
        } finally {
            executor.shutdownNow();
        }

        try (var files = Files.walk(storage.resolve(projectId))) {
            assertEquals(1, files.filter(Files::isRegularFile).count());
        }
    }

    @Test
    void processingUpdatesOnlyFloorPlanAndKeepsLatestFurniture() throws Exception {
        String projectId = createProject("저장 경합");
        String jobId = jobId(upload(projectId, "plan.pdf"));

        mvc.perform(put("/api/projects/{id}/layout", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"furniture":[
                                  {"id":"latest","catalogId":"plant-olive","name":"화분","category":"장식","x":2.0,"z":2.0,"rotation":0,"color":"#69805E"}
                                ]}
                                """))
                .andExpect(status().isOk());

        processor.process(projectId, jobId);

        mvc.perform(get("/api/projects/{id}", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.floorPlan.status").value("READY"))
                .andExpect(jsonPath("$.furniture[0].id").value("latest"));
    }

    @Test
    void interruptedJobsBecomeRetryableAndCanBeUploadedAgain() throws Exception {
        String projectId = createProject("재시작 복구");
        String jobId = jobId(upload(projectId, "before-restart.pdf"));

        recovery.recover();

        mvc.perform(get("/api/projects/{id}/floor-plan/jobs/{jobId}", projectId, jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.errorCode").value("PROCESSING_INTERRUPTED"))
                .andExpect(jsonPath("$.retryable").value(true));
        mvc.perform(get("/api/projects/{id}", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.floorPlan.status").value("FAILED"))
                .andExpect(jsonPath("$.floorPlan.errorCode").value("PROCESSING_INTERRUPTED"));

        assertEquals(200, upload(projectId, "retry.pdf").getResponse().getStatus());
    }

    @Test
    void completionAfterDeletionDoesNotRestoreProject() throws Exception {
        String projectId = createProject("삭제 경합");
        String jobId = jobId(upload(projectId, "delete.pdf"));

        mvc.perform(delete("/api/projects/{id}", projectId)).andExpect(status().isNoContent());
        processor.process(projectId, jobId);

        mvc.perform(get("/api/projects/{id}", projectId)).andExpect(status().isNotFound());
        assertTrue(Files.notExists(storage.resolve(projectId))
                || countRegularFiles(storage.resolve(projectId)) == 0);
    }

    private String createProject(String name) throws Exception {
        String response = mvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","roomType":"거실","dimensions":{"width":5,"depth":4,"height":2.4}}
                                """.formatted(name)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asString();
    }

    private MvcResult upload(String projectId, String fileName) throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", fileName, "application/pdf", "%PDF-1.7\n".getBytes());
        return mvc.perform(multipart("/api/projects/{id}/floor-plan", projectId).file(file)).andReturn();
    }

    private String jobId(MvcResult result) throws Exception {
        assertEquals(200, result.getResponse().getStatus());
        return mapper.readTree(result.getResponse().getContentAsString()).path("floorPlan").path("jobId").asString();
    }

    private long countRegularFiles(Path root) throws Exception {
        try (var files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).count();
        }
    }
}
