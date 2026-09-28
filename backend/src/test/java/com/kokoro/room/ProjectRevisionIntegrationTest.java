package com.kokoro.room;

import com.kokoro.room.project.FloorPlanJobCoordinator;
import com.kokoro.room.project.FloorPlanJobDispatcher;
import com.kokoro.room.project.FloorPlanJobRecovery;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Timeout(30)
class ProjectRevisionIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
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
    @Autowired JdbcTemplate jdbc;
    @Autowired FloorPlanJobCoordinator coordinator;
    @Autowired FloorPlanJobRecovery recovery;
    @MockitoBean FloorPlanJobDispatcher dispatcher;

    @Test
    void creationAndLegacyWritesExposeIncreasingRevision() throws Exception {
        String id = create();
        assertRevision(read(id), 0);
        assertRevision(json(layout(id, Map.of("furniture", furniture("a")))), 1);
        assertRevision(json(layout(id, Map.of("furniture", furniture("a")))), 2);
        JsonNode listed = json(mvc.perform(get("/api/projects")).andExpect(status().isOk()).andReturn());
        for (JsonNode project : listed) if (project.path("id").asText().equals(id)) assertRevision(project, 2);
    }

    @Test
    void staleLayoutRoomAndCommandPreserveEveryField() throws Exception {
        String id = create();
        assertEquals(200, layout(id, Map.of("furniture", furniture("a"), "expectedRevision", 0)).getResponse().getStatus());
        JsonNode before = read(id);
        assertEquals(409, layout(id, Map.of("furniture", List.of(), "expectedRevision", 0)).getResponse().getStatus());
        mvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("room", room(), "expectedRevision", 0))))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/projects/{id}/layout/commands", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"의자를 90도 회전해줘\",\"expectedRevision\":0}"))
                .andExpect(status().isConflict());
        assertEquals(before, read(id));
    }

    @Test
    void matchingCommandAdvancesRevisionAndInvalidInputDoesNot() throws Exception {
        String id = create();
        layout(id, Map.of("furniture", furniture("a")));
        var changed = json(mvc.perform(post("/api/projects/{id}/layout/commands", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"의자를 90도 회전해줘\",\"expectedRevision\":1}"))
                .andExpect(status().isOk()).andReturn());
        assertRevision(changed.path("project"), 2);
        JsonNode before = read(id);
        assertEquals(400, layout(id, Map.of("furniture", List.of(), "expectedRevision", -1)).getResponse().getStatus());
        assertEquals(400, layout(id, Map.of("furniture", List.of(Map.of("id", "bad")), "expectedRevision", 2)).getResponse().getStatus());
        assertEquals(before, read(id));
    }

    @Test
    void simultaneousSameVersionSavesHaveExactlyOneWinner() throws Exception {
        String id = create();
        List<Integer> statuses = race(
                () -> layout(id, Map.of("furniture", furniture("a"), "expectedRevision", 0)).getResponse().getStatus(),
                () -> layout(id, Map.of("furniture", furniture("b"), "expectedRevision", 0)).getResponse().getStatus());
        assertEquals(List.of(200, 409), statuses.stream().sorted().toList());
        assertRevision(read(id), 1);
        assertEquals(1, read(id).path("furniture").size());
    }

    @Test
    void concurrentLegacyRoomAndLayoutKeepBothChanges() throws Exception {
        String id = create();
        List<Integer> statuses = race(
                () -> layout(id, Map.of("furniture", furniture("a"))).getResponse().getStatus(),
                () -> mvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("room", room())))).andReturn().getResponse().getStatus());
        assertEquals(List.of(200, 200), statuses);
        JsonNode saved = read(id);
        assertRevision(saved, 2);
        assertEquals(room(), saved.path("room"));
        assertEquals(25.25, saved.path("furniture").get(0).path("rotation").doubleValue());
    }

    @Test
    void restoringContentAndTimestampDoesNotMakeOldProposalValid() throws Exception {
        String id = create();
        layout(id, Map.of("furniture", furniture("a")));
        String proposal = propose(id);
        layout(id, Map.of("furniture", furniture("b")));
        layout(id, Map.of("furniture", furniture("a")));
        // Deliberately equalize timestamps to prove that time is not the concurrency token.
        jdbc.update("UPDATE projects SET updated_at=(SELECT base_updated_at FROM layout_proposals WHERE proposal_id=?) WHERE id=?", proposal, id);
        JsonNode before = read(id);
        mvc.perform(post("/api/projects/{id}/layout/commands/confirm", id).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("proposalId", proposal)))).andExpect(status().isConflict());
        assertEquals(before, read(id));
        assertNull(jdbc.queryForObject("SELECT consumed_at FROM layout_proposals WHERE proposal_id=?", Object.class, proposal));
    }

    @Test
    void simultaneousConfirmConsumesOnceWithoutSecondRevision() throws Exception {
        String id = create();
        layout(id, Map.of("furniture", furniture("a")));
        String proposal = propose(id);
        Callable<Integer> confirm = () -> mvc.perform(post("/api/projects/{id}/layout/commands/confirm", id)
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("proposalId", proposal))))
                .andReturn().getResponse().getStatus();
        assertEquals(List.of(200, 200), race(confirm, confirm));
        assertRevision(read(id), 2);
        assertEquals(0, read(id).path("furniture").size());
    }

    @Test
    void oldProposalWithoutVersionFailsClosed() throws Exception {
        String id = create();
        // An old server inserts no base_revision. This remains a valid DB insert after migration.
        jdbc.update("INSERT INTO layout_proposals(proposal_id,project_id,owner_id,base_updated_at,commands,created_at,expires_at) SELECT 'legacy-'||id,id,owner_id,updated_at,'[{\"type\":\"CLEAR\"}]',now(),now()+interval '5 minutes' FROM projects WHERE id=?", id);
        mvc.perform(post("/api/projects/{id}/layout/commands/confirm", id).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("proposalId", "legacy-" + id)))).andExpect(status().isConflict());
    }

    @Test
    void floorPlanTransitionsAdvanceVersionAndOldJobsCannotChangeNewWork() throws Exception {
        String id = create();
        String job = upload(id);
        assertRevision(read(id), 1);
        assertTrue(coordinator.markProcessing(id, job, 25));
        assertRevision(read(id), 2);
        layout(id, Map.of("furniture", furniture("a")));
        assertTrue(coordinator.markReady(id, job));
        assertRevision(read(id), 4);
        JsonNode ready = read(id);
        assertFalse(coordinator.markProcessing(id, job, 10));
        assertEquals(ready, read(id));
        String next = upload(id);
        JsonNode before = read(id);
        assertFalse(coordinator.fail(id, job, "OLD", "old"));
        assertEquals(before, read(id));
        recovery.recover();
        assertRevision(read(id), 6);
        assertEquals("FAILED", read(id).path("floorPlan").path("status").asText());
        assertEquals("FAILED", jdbc.queryForObject("SELECT status FROM floor_plan_jobs WHERE job_id=?", String.class, next));
        assertEquals("READY", jdbc.queryForObject("SELECT status FROM floor_plan_jobs WHERE job_id=?", String.class, job));
        assertEquals(25.25, read(id).path("furniture").get(0).path("rotation").doubleValue());
        JsonNode failed = read(id);
        recovery.recover();
        assertEquals(failed, read(id));
    }

    @Test
    void migrationFromV8PreservesDataAndDoesNotInventProposalVersion() throws Exception {
        String schema = "revision_legacy";
        Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .schemas(schema).defaultSchema(schema).target("8").load().migrate();
        try (var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
            connection.setSchema(schema);
            try (var statement = connection.createStatement()) {
                statement.executeUpdate("INSERT INTO projects(id,owner_id,name,room_type,width,depth,height,updated_at) VALUES ('old','local-user','이전','거실',6,6,2.4,now())");
                statement.executeUpdate("INSERT INTO furniture_items(project_id,id,catalog_id,name,category,x,z,rotation,color,item_order) VALUES ('old','chair','chair-shell','의자','의자',3,3,25.25,'#000000',0)");
                statement.executeUpdate("INSERT INTO layout_proposals(proposal_id,project_id,owner_id,base_updated_at,commands,created_at,expires_at) VALUES ('old-proposal','old','local-user',now(),'[]',now(),now()+interval '5 minutes')");
                Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                        .schemas(schema).defaultSchema(schema).load().migrate();
                try (var columns = connection.getMetaData().getColumns(null, schema, "projects", "revision")) {
                    assertTrue(columns.next(), "V9 must add the project revision column");
                }
                try (var rows = statement.executeQuery("SELECT p.revision,f.rotation,l.base_revision FROM projects p JOIN furniture_items f ON f.project_id=p.id JOIN layout_proposals l ON l.project_id=p.id")) {
                    assertTrue(rows.next());
                    assertEquals(0, rows.getLong(1));
                    assertEquals(25.25, rows.getDouble(2));
                    assertNull(rows.getObject(3));
                }
            }
        }
    }

    private List<Integer> race(Callable<Integer> first, Callable<Integer> second) throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var tasks = List.of(first, second).stream().map(action -> pool.submit(() -> {
                ready.countDown();
                assertTrue(start.await(10, TimeUnit.SECONDS));
                return action.call();
            })).toList();
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            return List.of(tasks.get(0).get(15, TimeUnit.SECONDS), tasks.get(1).get(15, TimeUnit.SECONDS));
        } finally { start.countDown(); pool.shutdownNow(); }
    }
    private String upload(String id) throws Exception {
        var file = new MockMultipartFile("file", "plan.pdf", "application/pdf", "%PDF-1.7\n".getBytes());
        return json(mvc.perform(multipart("/api/projects/{id}/floor-plan", id).file(file))
                .andExpect(status().isOk()).andReturn()).path("floorPlan").path("jobId").asText();
    }
    private String propose(String id) throws Exception {
        return json(mvc.perform(post("/api/projects/{id}/layout/commands", id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"가구를 모두 비워줘\"}")).andExpect(status().isOk()).andReturn()).path("proposalId").asText();
    }
    private List<Map<String, Object>> furniture(String id) {
        return List.of(Map.of("id", id, "catalogId", "chair-shell", "name", "의자", "category", "의자",
                "x", 3, "z", 3, "rotation", 25.25, "color", "#000000"));
    }
    private JsonNode room() throws Exception {
        try (var input = getClass().getResourceAsStream("/contracts/furniture-rotation.json")) {
            return mapper.readTree(input).path("motion").path("room");
        }
    }
    private MvcResult layout(String id, Map<String, ?> body) throws Exception {
        return mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body))).andReturn();
    }
    private String create() throws Exception {
        return json(mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"버전 검사\",\"roomType\":\"거실\",\"dimensions\":{\"width\":6,\"depth\":6,\"height\":2.4}}"))
                .andExpect(status().isCreated()).andReturn()).path("id").asText();
    }
    private JsonNode read(String id) throws Exception {
        return json(mvc.perform(get("/api/projects/{id}", id)).andExpect(status().isOk()).andReturn());
    }
    private JsonNode json(MvcResult result) { return mapper.readTree(result.getResponse().getContentAsByteArray()); }
    private void assertRevision(JsonNode project, long expected) {
        assertTrue(project.path("revision").isIntegralNumber(), "revision must be present in responses");
        assertEquals(expected, project.path("revision").longValue());
    }
}
