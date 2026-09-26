package com.kokoro.room;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class LayoutProposalTest {
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
    @Autowired com.kokoro.room.project.ProjectRepository projects;

    @Test
    void previewDoesNotSaveAndConfirmationPersistsExactlyOnce() throws Exception {
        String id = create();
        var proposal = preview(id, 0, add("chair-shell", 1, 1));
        assertThat(project(id).path("furniture").size()).isZero();
        assertThat(project(id).path("revision").longValue()).isZero();
        assertThat(proposal.path("status").asString()).isEqualTo("PENDING");
        String proposalId = proposal.path("id").asString();
        var applied = act(id, proposalId, "confirm", 200);
        assertThat(applied.path("result").path("revision").longValue()).isEqualTo(1);
        assertThat(applied.path("result").path("ownerId").isMissingNode()).isTrue();
        assertThat(project(id).path("furniture")).isEqualTo(proposal.path("proposedFurniture"));
        // Ignore the initial response as if the browser disconnected. Status and retry recover it.
        assertThat(proposalStatus(id, proposalId).path("result")).isEqualTo(applied.path("result"));
        assertThat(act(id, proposalId, "confirm", 200).path("result")).isEqualTo(applied.path("result"));
        assertThat(project(id).path("revision").longValue()).isEqualTo(1);
    }

    @Test
    void clearNeedsConfirmationAndCancelledProposalsCannotApply() throws Exception {
        String id = create();
        act(id, preview(id, 0, add("chair-shell", 1, 1)).path("id").asString(), "confirm", 200);
        String cancelled = preview(id, 1, "{\"type\":\"CLEAR\"}").path("id").asString();
        assertThat(project(id).path("furniture").size()).isEqualTo(1);
        assertThat(act(id, cancelled, "cancel", 200).path("status").asString()).isEqualTo("CANCELLED");
        act(id, cancelled, "confirm", 409);
        assertThat(project(id).path("furniture").size()).isEqualTo(1);
        String clear = preview(id, 1, "{\"type\":\"CLEAR\"}").path("id").asString();
        act(id, clear, "confirm", 200);
        act(id, clear, "confirm", 200);
        assertThat(project(id).path("revision").longValue()).isEqualTo(2);
        assertThat(project(id).path("furniture").size()).isZero();
    }

    @Test
    void aBatchWithAnInvalidCommandDoesNotPersistItsValidPrefix() throws Exception {
        String id = create();
        mvc.perform(post(base(id)).contentType(MediaType.APPLICATION_JSON).content(
                        "{\"expectedRevision\":0,\"commands\":[" + add("chair-shell", 1, 1) + ","
                                + add("unknown", 3, 2) + "]}"))
                .andExpect(status().isBadRequest());
        assertThat(project(id).path("revision").longValue()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM layout_proposals WHERE project_id = ?", Integer.class, id)).isZero();
    }

    @Test
    void movesOnlyTheExactInstanceAndRejectsMissingTargets() throws Exception {
        String id = create();
        var initial = preview(id, 0, add("chair-shell", 1, 1) + "," + add("chair-shell", 3, 1));
        act(id, initial.path("id").asString(), "confirm", 200);
        String target = project(id).path("furniture").get(1).path("id").asString();
        var move = preview(id, 1, "{\"type\":\"MOVE\",\"furnitureId\":\"" + target + "\",\"x\":4,\"z\":2}");
        act(id, move.path("id").asString(), "confirm", 200);
        assertThat(project(id).path("furniture").get(0).path("x").doubleValue()).isEqualTo(1);
        assertThat(project(id).path("furniture").get(1).path("x").doubleValue()).isEqualTo(4);
        mvc.perform(post(base(id)).contentType(MediaType.APPLICATION_JSON).content("""
                {"expectedRevision":2,"commands":[{"type":"REMOVE","catalogId":"chair-shell"}]}
                """)).andExpect(status().isBadRequest());
        assertThat(project(id).path("furniture").size()).isEqualTo(2);
    }

    @Test
    void staleAndExpiredProposalsNeverChangeTheProject() throws Exception {
        String id = create();
        String stale = preview(id, 0, add("chair-shell", 1, 1)).path("id").asString();
        mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":0,\"furniture\":[]}"))
                .andExpect(status().isOk());
        assertThat(proposalStatus(id, stale).path("status").asString()).isEqualTo("STALE");
        act(id, stale, "confirm", 409);
        String expired = preview(id, 1, add("chair-shell", 1, 1)).path("id").asString();
        jdbc.update("UPDATE layout_proposals SET expires_at = now() - interval '1 second' WHERE id = ?", expired);
        assertThat(proposalStatus(id, expired).path("status").asString()).isEqualTo("EXPIRED");
        act(id, expired, "confirm", 409);
        assertThat(project(id).path("revision").longValue()).isEqualTo(1);
        assertThat(project(id).path("furniture").size()).isZero();
    }

    @Test
    void foreignProjectsOwnersAndAbsentVersionsAreRejected() throws Exception {
        String id = create();
        String proposal = preview(id, 0, add("chair-shell", 1, 1)).path("id").asString();
        act(create(), proposal, "confirm", 404);
        mvc.perform(post(base(id)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commands\":[{\"type\":\"CLEAR\"}]}"))
                .andExpect(status().isBadRequest());
        jdbc.update("UPDATE layout_proposals SET owner_id = 'someone-else' WHERE id = ?", proposal);
        act(id, proposal, "confirm", 404);
        act(id, proposal, "cancel", 404);
        assertThat(project(id).path("revision").longValue()).isZero();
    }

    @Test
    void concurrentConfirmationsReturnTheSameResultWithoutDoubleApplying() throws Exception {
        String id = create();
        String proposal = preview(id, 0, add("chair-shell", 1, 1)).path("id").asString();
        var results = race(id, proposal, "confirm", "confirm");
        assertThat(results.get(0).path("result")).isEqualTo(results.get(1).path("result"));
        assertThat(project(id).path("revision").longValue()).isEqualTo(1);
        assertThat(project(id).path("furniture").size()).isEqualTo(1);
    }

    @Test
    void confirmRacingCancelHasOneConsistentTerminalOutcome() throws Exception {
        String id = create();
        String proposal = preview(id, 0, add("chair-shell", 1, 1)).path("id").asString();
        race(id, proposal, "confirm", "cancel");
        String state = proposalStatus(id, proposal).path("status").asString();
        assertThat(state).isIn("APPLIED", "CANCELLED");
        assertThat(project(id).path("revision").longValue()).isEqualTo(state.equals("APPLIED") ? 1 : 0);
        assertThat(project(id).path("furniture").size()).isEqualTo(state.equals("APPLIED") ? 1 : 0);
    }

    @Test
    void aRepeatedConfirmationAfterAnotherEditDoesNotRestoreTheOldResult() throws Exception {
        String id = create();
        String first = preview(id, 0, add("chair-shell", 1, 1)).path("id").asString();
        act(id, first, "confirm", 200);
        String clear = preview(id, 1, "{\"type\":\"CLEAR\"}").path("id").asString();
        act(id, clear, "confirm", 200);
        assertThat(act(id, first, "confirm", 200).path("result").path("revision").longValue()).isEqualTo(1);
        assertThat(project(id).path("revision").longValue()).isEqualTo(2);
        assertThat(project(id).path("furniture").size()).isZero();
    }

    @Test
    void rotationAndRemovalUseTheSamePreviewAndConfirmationPath() throws Exception {
        String id = create();
        act(id, preview(id, 0, add("chair-shell", 2, 2)).path("id").asString(), "confirm", 200);
        String target = project(id).path("furniture").get(0).path("id").asString();
        String rotate = preview(id, 1, "{\"type\":\"ROTATE\",\"furnitureId\":\"" + target
                + "\",\"rotation\":90}").path("id").asString();
        assertThat(project(id).path("furniture").get(0).path("rotation").intValue()).isZero();
        act(id, rotate, "confirm", 200);
        assertThat(project(id).path("furniture").get(0).path("rotation").intValue()).isEqualTo(90);
        String remove = preview(id, 2, "{\"type\":\"REMOVE\",\"furnitureId\":\"" + target + "\"}")
                .path("id").asString();
        act(id, remove, "confirm", 200);
        assertThat(project(id).path("furniture").size()).isZero();
        assertThat(project(id).path("revision").longValue()).isEqualTo(3);
    }

    @Test
    void confirmationRevalidatesCatalogAndRollsBackBothLayoutAndProposalOnFailure() throws Exception {
        String id = create();
        String proposal = preview(id, 0, add("chair-shell", 1, 1)).path("id").asString();
        String original = jdbc.queryForObject("SELECT payload::text FROM furniture_catalog WHERE id = 'chair-shell'", String.class);
        try {
            jdbc.update("UPDATE furniture_catalog SET payload = jsonb_set(payload, '{width}', '10'::jsonb) WHERE id = 'chair-shell'");
            act(id, proposal, "confirm", 400);
            assertThat(project(id).path("revision").longValue()).isZero();
            assertThat(project(id).path("furniture").size()).isZero();
            assertThat(proposalStatus(id, proposal).path("status").asString()).isEqualTo("PENDING");
            assertThat(proposalStatus(id, proposal).path("result").isNull()).isTrue();
        } finally {
            jdbc.update("UPDATE furniture_catalog SET payload = ?::jsonb WHERE id = 'chair-shell'", original);
        }
    }

    @Test
    void confirmationRacingManualLayoutOrRoomSaveAppliesOnlyOneWrite() throws Exception {
        for (String resource : List.of("layout", "room")) {
            String id = create();
            String proposal = preview(id, 0, add("chair-shell", 1, 1)).path("id").asString();
            String manualBody;
            if (resource.equals("layout")) {
                manualBody = "{\"expectedRevision\":0,\"furniture\":[]}";
            } else {
                var room = mapper.readTree(getClass().getResourceAsStream("/contracts/room-v2.json")).path("room");
                manualBody = mapper.writeValueAsString(mapper.createObjectNode().put("expectedRevision", 0).set("room", room));
            }
            var results = raceCalls(
                    () -> mvc.perform(post(base(id) + "/" + proposal + "/confirm")).andReturn().getResponse().getStatus(),
                    () -> mvc.perform(put("/api/projects/" + id + "/" + resource).contentType(MediaType.APPLICATION_JSON)
                            .content(manualBody)).andReturn().getResponse().getStatus());
            assertThat(results).containsExactlyInAnyOrder(200, 409);
            assertThat(project(id).path("revision").longValue()).isEqualTo(1);
            assertThat(project(id).path("furniture").size()).isEqualTo(results.get(0) == 200 ? 1 : 0);
            assertThat(proposalStatus(id, proposal).path("status").asString())
                    .isEqualTo(results.get(0) == 200 ? "APPLIED" : "STALE");
        }
    }

    @Test
    void floorPlanCompletionBeforeOrAfterConfirmationCannotOverwriteFurniture() throws Exception {
        for (boolean completeFirst : List.of(true, false)) {
            String id = create();
            jdbc.update("UPDATE projects SET floor_plan_job_id = 'job', floor_plan_status = 'PROCESSING' WHERE id = ?", id);
            String proposal = preview(id, 0, add("chair-shell", 1, 1)).path("id").asString();
            if (!completeFirst) act(id, proposal, "confirm", 200);
            assertThat(projects.updateFloorPlanStatus(id, "job",
                    com.kokoro.room.project.ProjectModels.ConversionStatus.READY, 100, null, null, false)).isTrue();
            if (completeFirst) act(id, proposal, "confirm", 409);
            assertThat(project(id).path("furniture").size()).isEqualTo(completeFirst ? 0 : 1);
            assertThat(project(id).path("revision").longValue()).isEqualTo(completeFirst ? 1 : 2);
            assertThat(proposalStatus(id, proposal).path("status").asString()).isEqualTo(completeFirst ? "STALE" : "APPLIED");
        }
    }

    private List<Integer> raceCalls(java.util.concurrent.Callable<Integer> first,
                                    java.util.concurrent.Callable<Integer> second) throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var tasks = List.of(first, second).stream().map(call -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout");
                return call.call();
            })).toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return List.of(tasks.get(0).get(10, TimeUnit.SECONDS), tasks.get(1).get(10, TimeUnit.SECONDS));
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    private List<JsonNode> race(String project, String proposal, String firstAction, String secondAction) throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var tasks = List.of(firstAction, secondAction).stream().map(action -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout");
                var response = mvc.perform(post(base(project) + "/" + proposal + "/" + action)).andReturn().getResponse();
                assertThat(response.getStatus()).isIn(200, 409);
                return mapper.readTree(response.getContentAsString());
            })).toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return List.of(tasks.get(0).get(10, TimeUnit.SECONDS), tasks.get(1).get(10, TimeUnit.SECONDS));
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    private String create() throws Exception {
        return mapper.readTree(mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"제안 검사","roomType":"거실","dimensions":{"width":6,"depth":4,"height":2.4}}
                """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
    }

    private JsonNode project(String id) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/projects/{id}", id)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode preview(String id, long revision, String commands) throws Exception {
        return mapper.readTree(mvc.perform(post(base(id)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + revision + ",\"commands\":[" + commands + "]}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode proposalStatus(String id, String proposal) throws Exception {
        return mapper.readTree(mvc.perform(get(base(id) + "/" + proposal)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode act(String id, String proposal, String action, int expected) throws Exception {
        return mapper.readTree(mvc.perform(post(base(id) + "/" + proposal + "/" + action))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }

    private static String base(String id) { return "/api/projects/" + id + "/layout/proposals"; }
    private static String add(String catalog, double x, double z) {
        return "{\"type\":\"ADD\",\"catalogId\":\"" + catalog + "\",\"x\":" + x + ",\"z\":" + z + ",\"rotation\":0}";
    }
}
