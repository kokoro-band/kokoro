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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class LayoutIntentTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;

    @Test
    void addsThenMovesTheSelectedInstanceByExactlyHalfAMeter() throws Exception {
        String id = create();
        var first = propose(id, 0, command("ADD", "chair-shell", null, null, "AUTO", 0, 1), Map.of(), null, 200);
        var chair = first.path("proposedFurniture").get(0);
        confirm(id, first);
        var move = propose(id, 1, command("MOVE", null, "선택한 가구", null, "OFFSET_RIGHT", 0.5, 1), Map.of(), chair.path("id").asString(), 200);
        assertThat(move.path("proposedFurniture").get(0).path("x").doubleValue()).isEqualTo(chair.path("x").doubleValue() + 0.5);
        confirm(id, move);
        assertThat(project(id).path("furniture")).isEqualTo(move.path("proposedFurniture"));
    }

    @Test
    void addsRelativeToTheActualSofaAndDoesNotMoveTheAnchor() throws Exception {
        String id = create();
        var first = propose(id, 0, command("ADD", "sofa-cloud", null, null, "AUTO", 0, 1), Map.of(), null, 200);
        confirm(id, first);
        var relative = propose(id, 1, command("ADD", "plant-olive", null, "소파", "RIGHT", 0, 1), Map.of(), null, 200);
        assertThat(relative.path("proposedFurniture").get(0)).isEqualTo(first.path("proposedFurniture").get(0));
        assertThat(relative.path("proposedFurniture").get(1).path("x").doubleValue())
                .isGreaterThan(relative.path("proposedFurniture").get(0).path("x").doubleValue() + 1);
        assertThat(project(id).path("furniture").size()).isEqualTo(1);
    }

    @Test
    void duplicateNamesRequireAnExplicitValidChoice() throws Exception {
        String id = create();
        var first = propose(id, 0, command("ADD", "chair-shell", null, null, "AUTO", 0, 2), Map.of(), null, 200);
        confirm(id, first);
        String remove = command("REMOVE", null, "의자", null, "AUTO", 0, 1);
        var choice = propose(id, 1, remove, Map.of(), null, 422);
        assertThat(choice.path("code").asString()).isEqualTo("AMBIGUOUS_TARGET");
        assertThat(choice.path("candidates").size()).isEqualTo(2);
        String chosen = first.path("proposedFurniture").get(1).path("id").asString();
        propose(id, 1, remove, Map.of("0:target", "not-present"), null, 400);
        var proposal = propose(id, 1, remove, Map.of("0:target", chosen), null, 200);
        assertThat(proposal.path("proposedFurniture").size()).isEqualTo(1);
        assertThat(proposal.path("proposedFurniture").get(0).path("id"))
                .isEqualTo(first.path("proposedFurniture").get(0).path("id"));
    }

    @Test
    void choiceRetriesKeepIdsForFurnitureAddedEarlierInTheSameBatch() throws Exception {
        String id = create();
        String commands = command("ADD", "chair-shell", null, null, "AUTO", 0, 2) + ","
                + command("ROTATE", null, "의자", null, "AUTO", 0, 1).replace("\"rotation\":0", "\"rotation\":180");
        var choice = propose(id, 0, commands, Map.of(), null, 422);
        assertThat(choice.path("choiceKey").asString()).isEqualTo("1:target");
        String selected = choice.path("candidates").get(1).path("id").asString();
        var retry = propose(id, 0, commands, Map.of("1:target", selected), null, 200);
        assertThat(retry.path("proposedFurniture").get(1).path("id").asString()).isEqualTo(selected);
        assertThat(retry.path("proposedFurniture").get(1).path("rotation").intValue()).isEqualTo(180);
        assertThat(project(id).path("furniture").size()).isZero();
        confirm(id, retry);
        assertThat(project(id).path("furniture").size()).isEqualTo(2);
    }

    @Test
    void allDirectionsUseTheSelectedRoomsOffsetBounds() throws Exception {
        String id = create();
        String room = """
                {"version":2,"unit":"m","wallHeight":2.4,"bounds":{"width":12,"depth":12},
                 "outline":[[0,0],[12,0],[12,12],[0,12]],"walls":[],"openings":[],
                 "rooms":[{"name":"작은방","polygon":[[8,8],[12,8],[12,12],[8,12]]}]}
                """;
        mvc.perform(put("/api/projects/" + id + "/room").contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedRevision\":0,\"room\":" + room + "}")).andExpect(status().isOk());
        for (String direction : new String[]{"LEFT", "RIGHT", "FRONT", "BACK"}) {
            var preview = propose(id, 1, command("ADD", "chair-shell", null, null, direction, 0, 1), Map.of(), null, "작은방", 200);
            var item = preview.path("proposedFurniture").get(0);
            double x = item.path("x").doubleValue(), z = item.path("z").doubleValue();
            assertThat(x).isBetween(8.0, 12.0);
            assertThat(z).isBetween(8.0, 12.0);
            switch (direction) {
                case "LEFT" -> assertThat(x).isLessThan(9);
                case "RIGHT" -> assertThat(x).isGreaterThan(11);
                case "FRONT" -> assertThat(z).isGreaterThan(11);
                case "BACK" -> assertThat(z).isLessThan(9);
            }
        }
    }

    @Test
    void missingWindowsAreNotReplacedByAnInventedPosition() throws Exception {
        String id = create();
        var error = propose(id, 0, command("ADD", "chair-shell", null, null, "NEAR_WINDOW", 0, 1), Map.of(), null, 422);
        assertThat(error.path("code").asString()).isEqualTo("NO_ANCHOR");
        assertThat(project(id).path("revision").longValue()).isZero();
    }

    @Test
    void changingTheActualWindowChangesTheTwoChairPositions() throws Exception {
        double[] firstX = new double[2];
        for (int index = 0; index < 2; index++) {
            String id = create();
            double from = index == 0 ? 0.6 : 4.6;
            String room = """
                    {"version":2,"unit":"m","wallHeight":2.4,"bounds":{"width":6,"depth":4},
                     "outline":[[0,0],[6,0],[6,4],[0,4]],"walls":[{"id":"top","a":[0,0],"b":[6,0],"thickness":0.2}],
                     "openings":[{"id":"window","wallId":"top","type":"window","from":%s,"to":%s,"bottom":1,"top":2}],"rooms":[]}
                    """.formatted(from, from + 0.8);
            mvc.perform(put("/api/projects/" + id + "/room").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"expectedRevision\":0,\"room\":" + room + "}")).andExpect(status().isOk());
            var proposed = propose(id, 1, command("ADD", "chair-shell", null, null, "NEAR_WINDOW", 0, 2), Map.of(), null, 200);
            assertThat(proposed.path("proposedFurniture").size()).isEqualTo(2);
            firstX[index] = proposed.path("proposedFurniture").get(0).path("x").doubleValue();
            confirm(id, proposed);
        }
        assertThat(firstX[1] - firstX[0]).isGreaterThan(3);
    }

    @Test
    void multipleDoorsRequireAChoiceAndTheChosenDoorKeepsItsClearance() throws Exception {
        String id = create();
        String room = """
                {"version":2,"unit":"m","wallHeight":2.4,"bounds":{"width":6,"depth":4},
                 "outline":[[0,0],[6,0],[6,4],[0,4]],"walls":[{"id":"top","a":[0,0],"b":[6,0],"thickness":0.2}],
                 "openings":[{"id":"left","wallId":"top","type":"door","from":0.6,"to":1.4,"bottom":0,"top":2.1},
                             {"id":"right","wallId":"top","type":"door","from":4.6,"to":5.4,"bottom":0,"top":2.1}],"rooms":[]}
                """;
        mvc.perform(put("/api/projects/" + id + "/room").contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedRevision\":0,\"room\":" + room + "}")).andExpect(status().isOk());
        String command = command("ADD", "chair-shell", null, null, "NEAR_DOOR", 0, 1);
        var choices = propose(id, 1, command, Map.of(), null, 422);
        assertThat(choices.path("code").asString()).isEqualTo("AMBIGUOUS_ANCHOR");
        assertThat(choices.path("candidates").size()).isEqualTo(2);
        propose(id, 1, command, Map.of("0:anchor", "missing"), null, 400);
        var preview = propose(id, 1, command, Map.of("0:anchor", "right"), null, 200);
        var chair = preview.path("proposedFurniture").get(0);
        assertThat(Math.hypot(chair.path("x").doubleValue() - 5, chair.path("z").doubleValue())).isLessThanOrEqualTo(2);
        confirm(id, preview);
    }

    @Test
    void invalidFieldsOrCommandsCannotSaveAValidPrefix() throws Exception {
        String id = create();
        String valid = command("ADD", "chair-shell", null, null, "AUTO", 0, 1);
        propose(id, 0, valid + "," + command("ADD", "invented", null, null, "AUTO", 0, 1), Map.of(), null, 400);
        propose(id, 0, valid.replace("\"count\":1", "\"count\":1.5"), Map.of(), null, 400);
        propose(id, 0, valid.replace("\"count\":1", "\"count\":1,\"url\":\"https://example.com\""), Map.of(), null, 400);
        propose(id, 0, command("ADD", "chair-shell", null, null, "OFFSET_LEFT", 1, 1), Map.of(), null, 400);
        assertThat(project(id).path("revision").longValue()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM layout_proposals WHERE project_id = ?", Integer.class, id)).isZero();
    }

    private JsonNode propose(String id, long revision, String commands, Map<String, String> choices, String selected, int expected) throws Exception {
        return propose(id, revision, commands, choices, selected, null, expected);
    }
    private JsonNode propose(String id, long revision, String commands, Map<String, String> choices, String selected, String focus, int expected) throws Exception {
        var request = mapper.createObjectNode().put("expectedRevision", revision);
        request.set("intent", mapper.readTree("{\"reply\":\"요청 해석\",\"commands\":[" + commands + "]}"));
        request.set("choices", mapper.valueToTree(choices));
        if (selected != null) request.put("selectedFurnitureId", selected);
        if (focus != null) request.put("focusRoomName", focus);
        return mapper.readTree(mvc.perform(post("/api/projects/" + id + "/layout/proposals/intent").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    private void confirm(String id, JsonNode proposal) throws Exception {
        mvc.perform(post("/api/projects/" + id + "/layout/proposals/" + proposal.path("id").asString() + "/confirm"))
                .andExpect(status().isOk());
    }
    private String create() throws Exception {
        return mapper.readTree(mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"의미 배치 검사","roomType":"거실","dimensions":{"width":6,"depth":4,"height":2.4}}
                """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
    }
    private JsonNode project(String id) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/projects/" + id)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    private String command(String action, String catalog, String target, String anchor, String placement, double distance, int count) {
        var command = mapper.createObjectNode().put("action", action).put("catalogId", catalog).put("targetQuery", target)
                .put("anchorQuery", anchor).put("placement", placement).put("distanceM", distance).put("rotation", 0).put("count", count);
        return mapper.writeValueAsString(command);
    }
}
