package com.kokoro.room;

import com.kokoro.room.floorplan.FloorPlanStorage;
import com.kokoro.room.project.FloorPlanFileCleanup;
import com.kokoro.room.project.FloorPlanJobDispatcher;
import com.kokoro.room.project.FloorPlanJobProcessor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FloorPlanFileCleanupTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @TempDir static Path storageRoot;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("app.floor-plan-storage-root", () -> storageRoot.toString());
        // Keep the scheduled retry out of the way so the test decides when a retry happens.
        registry.add("app.floor-plan-cleanup-retry-interval", () -> "PT1H");
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired FloorPlanJobProcessor processor;
    @Autowired FloorPlanFileCleanup cleanup;
    @MockitoSpyBean FloorPlanStorage storage;
    @MockitoBean FloorPlanJobDispatcher dispatcher;

    @Test
    void failedFileDeletionKeepsTheDeleteAndIsRetriedUntilTheFilesAreGone() throws Exception {
        String projectId = createProject();
        processor.process(projectId, jobId(upload(projectId, "first.pdf")));
        upload(projectId, "second.pdf");
        assertThat(countFiles(projectId)).isEqualTo(2);

        doThrow(new IOException("disk unavailable")).when(storage).delete(anyString());
        mvc.perform(delete("/api/projects/{id}", projectId)).andExpect(status().isNoContent());

        mvc.perform(get("/api/projects/{id}", projectId)).andExpect(status().isNotFound());
        assertThat(countFiles(projectId)).isEqualTo(2);
        assertThat(pending(projectId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("""
                SELECT MIN(attempts) FROM floor_plan_file_cleanup WHERE project_id = ?
                """, Integer.class, projectId)).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT MAX(last_error) FROM floor_plan_file_cleanup WHERE project_id = ?
                """, String.class, projectId)).isEqualTo("IOException").doesNotContain(projectId);

        doCallRealMethod().when(storage).delete(anyString());
        cleanup.drain();

        assertThat(pending(projectId)).isZero();
        assertThat(countFiles(projectId)).isZero();
    }

    // Characterization tests: they pin the current behavior of FloorPlanFileCleanup without changing it.

    @Test
    void enqueueDoesNotRecordTheSameKeyTwice() {
        cleanup.enqueue("idempotent-project", List.of("idempotent-project/a/source", "idempotent-project/a/source",
                "idempotent-project/b/source"));
        cleanup.enqueue("idempotent-project", List.of("idempotent-project/a/source"));

        assertThat(pending("idempotent-project")).isEqualTo(2);
        cleanup.drain();
        assertThat(pending("idempotent-project")).isZero();
    }

    @Test
    void rowsLeftBeforeARestartAreProcessedByTheNextDrain() throws Exception {
        Path file = storageRoot.resolve("restart-project/job/source");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "left over");
        jdbc.update("""
                INSERT INTO floor_plan_file_cleanup (object_key, project_id, created_at, attempts, last_error)
                VALUES ('restart-project/job/source', 'restart-project', now(), 3, 'IOException')
                """);

        cleanup.drain();

        assertThat(pending("restart-project")).isZero();
        assertThat(Files.notExists(file)).isTrue();
    }

    @Test
    void drainCoversMoreThanOneBatchAndStopsWhenOnlyFailuresRemain() throws Exception {
        List<String> keys = new ArrayList<>();
        for (int i = 0; i < 125; i++) keys.add("batch-project/k-%03d/source".formatted(i));
        for (int i = 0; i < 5; i++) keys.add("batch-project/k-bad-%d/source".formatted(i));
        for (String key : keys) {
            Path file = storageRoot.resolve(key);
            Files.createDirectories(file.getParent());
            Files.writeString(file, "x");
        }
        cleanup.enqueue("batch-project", keys);
        doThrow(new IOException("denied")).when(storage).delete(argThat(key -> key != null && key.contains("-bad-")));

        assertTimeoutPreemptively(Duration.ofSeconds(30), () -> cleanup.drain());

        assertThat(pending("batch-project")).isEqualTo(5);
        assertThat(countFiles("batch-project")).isEqualTo(5);
        int firstRunAttempts = attempts("batch-project");
        assertThat(firstRunAttempts).isGreaterThanOrEqualTo(5);

        assertTimeoutPreemptively(Duration.ofSeconds(30), () -> cleanup.drain());

        assertThat(pending("batch-project")).isEqualTo(5);
        assertThat(attempts("batch-project")).isGreaterThan(firstRunAttempts);
    }

    private int attempts(String projectId) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(attempts), 0) FROM floor_plan_file_cleanup WHERE project_id = ?",
                Integer.class, projectId);
    }

    private int pending(String projectId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM floor_plan_file_cleanup WHERE project_id = ?",
                Integer.class, projectId);
    }

    private long countFiles(String projectId) throws IOException {
        Path root = storageRoot.resolve(projectId);
        if (Files.notExists(root)) return 0;
        try (var files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).count();
        }
    }

    private String createProject() throws Exception {
        String response = mvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"정리 재시도","roomType":"거실","dimensions":{"width":5,"depth":4,"height":2.4}}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asString();
    }

    private MvcResult upload(String projectId, String fileName) throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", fileName, "application/pdf", "%PDF-1.7\n".getBytes());
        return mvc.perform(multipart("/api/projects/{id}/floor-plan", projectId).file(file)).andReturn();
    }

    private String jobId(MvcResult result) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return mapper.readTree(result.getResponse().getContentAsString()).path("floorPlan").path("jobId").asString();
    }
}
