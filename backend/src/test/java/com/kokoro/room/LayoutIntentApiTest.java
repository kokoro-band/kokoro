package com.kokoro.room;

import com.kokoro.room.project.FloorPlanJobDispatcher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class LayoutIntentApiTest {
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
    @MockitoBean FloorPlanJobDispatcher dispatcher;

    private static final String LAYOUT = """
            {"furniture":[
              {"id":"sofa-a","catalogId":"sofa-cloud","name":"클라우드 소파","category":"소파","x":6.5,"z":4.5,"rotation":0,"color":"#D8C8B8"},
              {"id":"chair-a","catalogId":"chair-shell","name":"셸 체어","category":"의자","x":1.0,"z":1.0,"rotation":0,"color":"#4A665A"},
              {"id":"chair-b","catalogId":"chair-shell","name":"셸 체어","category":"의자","x":2.5,"z":1.0,"rotation":0,"color":"#4A665A"}
            ]}""";

    @Test
    void proposalIsOnlyAppliedAfterConfirm() throws Exception {
        String id = projectWithFurniture();

        JsonNode proposal = intents(id, "{\"type\":\"REMOVE\",\"targetQuery\":\"소파\"}", null, 200);
        assertThat(proposal.path("requiresConfirmation").asBoolean()).isTrue();
        assertThat(proposal.path("appliedActions")).isEmpty();
        assertThat(furnitureIds(project(id))).containsExactlyInAnyOrder("sofa-a", "chair-a", "chair-b");

        JsonNode confirmed = send(id, "/layout/commands/confirm", "{\"proposalId\":\"" + proposal.path("proposalId").asString() + "\"}", 200);
        assertThat(furnitureIds(confirmed.path("project"))).containsExactlyInAnyOrder("chair-a", "chair-b");
        assertThat(furnitureIds(project(id))).containsExactlyInAnyOrder("chair-a", "chair-b");
    }

    @Test
    void duplicateTargetsReturnCandidatesAndTheSelectionIsProposed() throws Exception {
        String id = projectWithFurniture();
        String rotate = "{\"type\":\"ROTATE\",\"targetQuery\":\"의자\",\"rotation\":90}";

        JsonNode candidates = intents(id, rotate, null, 200);
        assertThat(candidates.path("candidates")).hasSize(2);
        assertThat(candidates.path("proposalId").isNull()).isTrue();

        JsonNode proposal = intents(id, rotate, "{\"0\":\"chair-b\"}", 200);
        JsonNode confirmed = send(id, "/layout/commands/confirm", "{\"proposalId\":\"" + proposal.path("proposalId").asString() + "\"}", 200);
        for (JsonNode item : confirmed.path("project").path("furniture")) {
            if (item.path("id").asString().equals("chair-b")) assertThat(item.path("rotation").asDouble()).isEqualTo(90.0);
            if (item.path("id").asString().equals("chair-a")) assertThat(item.path("rotation").asDouble()).isZero();
        }
    }

    @Test
    void addUsesTheRegisteredFurnitureDefinition() throws Exception {
        String id = projectWithFurniture();

        JsonNode proposal = intents(id, "{\"type\":\"ADD\",\"catalogId\":\"sofa-moss\"}", null, 200);
        JsonNode confirmed = send(id, "/layout/commands/confirm", "{\"proposalId\":\"" + proposal.path("proposalId").asString() + "\"}", 200);
        JsonNode added = null;
        for (JsonNode item : confirmed.path("project").path("furniture")) {
            if (item.path("catalogId").asString().equals("sofa-moss")) added = item;
        }
        assertThat(added).isNotNull();
        assertThat(added.path("name").asString()).isEqualTo("모스 소파");
        assertThat(added.path("category").asString()).isEqualTo("소파");
    }

    @Test
    void invalidOrUnsupportedIntentsChangeNothing() throws Exception {
        String id = projectWithFurniture();
        long revision = project(id).path("revision").asLong();

        intents(id, "{\"type\":\"ADD\",\"catalogId\":\"no-such-item\"}", null, 400);
        intents(id, "{\"type\":\"MOVE\",\"targetQuery\":\"소파\"}", null, 400);
        intents(id, "{\"type\":\"ADD\",\"catalogId\":\"sofa-moss\",\"anchorQuery\":\"창문\"}", null, 400);
        intents(id, "{\"type\":\"ROTATE\",\"targetQuery\":\"소파\",\"rotation\":45.5}", null, 400);
        intents(id, "{\"type\":\"MOVE\",\"targetQuery\":\"소파\",\"x\":1,\"z\":2}", null, 400);
        intents(id, "{\"type\":\"REMOVE\",\"targetQuery\":\"침대\"}", null, 400);
        intents(id, "{\"type\":\"ROTATE\",\"targetQuery\":\"의자\",\"rotation\":90}", "{\"0\":\"sofa-a\"}", 400);

        assertThat(project(id).path("revision").asLong()).isEqualTo(revision);
        assertThat(furnitureIds(project(id))).containsExactlyInAnyOrder("sofa-a", "chair-a", "chair-b");
    }

    @Test
    void confirmingAfterTheProjectChangedIsAConflict() throws Exception {
        String id = projectWithFurniture();
        JsonNode proposal = intents(id, "{\"type\":\"REMOVE\",\"targetQuery\":\"소파\"}", null, 200);

        mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON).content(LAYOUT))
                .andExpect(status().isOk());

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/projects/{id}/layout/commands/confirm", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\":\"" + proposal.path("proposalId").asString() + "\"}"))
                .andExpect(status().isConflict());
        assertThat(furnitureIds(project(id))).containsExactlyInAnyOrder("sofa-a", "chair-a", "chair-b");
    }

    private static String room(String openings) {
        return """
                {"room":{"version":2,"unit":"m","wallHeight":2.4,"bounds":{"width":8,"depth":6},
                 "outline":[[0,0],[8,0],[8,6],[0,6]],
                 "walls":[{"id":"top","a":[0,0],"b":[8,0],"thickness":0.2},{"id":"right","a":[8,0],"b":[8,6],"thickness":0.2},
                          {"id":"bottom","a":[8,6],"b":[0,6],"thickness":0.2},{"id":"left","a":[0,6],"b":[0,0],"thickness":0.2}],
                 "openings":[%s]}}""".formatted(openings);
    }

    private static final String WINDOW_ON_TOP = "{\"id\":\"win\",\"wallId\":\"top\",\"type\":\"window\",\"from\":3.5,\"to\":4.5,\"bottom\":0.9,\"top\":2.1}";
    private static final String DOOR_ON_BOTTOM = "{\"id\":\"door\",\"wallId\":\"bottom\",\"type\":\"door\",\"from\":1.0,\"to\":1.9,\"bottom\":0,\"top\":2.1}";

    private void saveRoom(String id, String openings) throws Exception {
        mvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON).content(room(openings)))
                .andExpect(status().isOk());
    }

    @Test
    void addNearTheWindowProposesASpotBesideTheWindowAndConfirmApplies() throws Exception {
        String id = projectWithFurniture();
        saveRoom(id, WINDOW_ON_TOP);

        JsonNode proposal = intents(id, "{\"type\":\"ADD\",\"catalogId\":\"chair-sand\",\"anchorQuery\":\"창가\"}", null, 200);

        JsonNode command = proposal.path("proposedCommands").get(0);
        assertThat(command.path("type").asString()).isEqualTo("ADD");
        assertThat(command.path("x").asDouble()).isBetween(3.0, 5.0);
        assertThat(command.path("z").asDouble()).isLessThan(1.5);
        assertThat(furnitureIds(project(id))).hasSize(3);

        JsonNode confirmed = send(id, "/layout/commands/confirm", "{\"proposalId\":\"" + proposal.path("proposalId").asString() + "\"}", 200);
        JsonNode added = null;
        for (JsonNode item : confirmed.path("project").path("furniture")) {
            if (item.path("catalogId").asString().equals("chair-sand")) added = item;
        }
        assertThat(added).isNotNull();
        assertThat(added.path("x").asDouble()).isEqualTo(command.path("x").asDouble());
        assertThat(added.path("z").asDouble()).isEqualTo(command.path("z").asDouble());
    }

    @Test
    void roomWithoutTheRequestedAnchorIsRejectedWithACodeAndNothingChanges() throws Exception {
        String id = projectWithFurniture();
        saveRoom(id, DOOR_ON_BOTTOM);
        long revision = project(id).path("revision").asLong();

        JsonNode problem = intents(id, "{\"type\":\"ADD\",\"catalogId\":\"chair-sand\",\"anchorQuery\":\"창가\"}", null, 400);

        assertThat(problem.path("code").asString()).isEqualTo("NO_ANCHOR");
        intents(id, "{\"type\":\"MOVE\",\"targetQuery\":\"소파\",\"anchorQuery\":\"벽\"}", null, 400);
        assertThat(project(id).path("revision").asLong()).isEqualTo(revision);
    }

    @Test
    void moveNearTheWindowKeepsTheRotationAndConfirmMovesIt() throws Exception {
        String id = projectWithFurniture();
        saveRoom(id, WINDOW_ON_TOP + "," + DOOR_ON_BOTTOM);

        JsonNode proposal = intents(id, "{\"type\":\"MOVE\",\"targetQuery\":\"소파\",\"anchorQuery\":\"창문\",\"relation\":\"NEAR\"}", null, 200);
        JsonNode confirmed = send(id, "/layout/commands/confirm", "{\"proposalId\":\"" + proposal.path("proposalId").asString() + "\"}", 200);

        for (JsonNode item : confirmed.path("project").path("furniture")) {
            if (item.path("id").asString().equals("sofa-a")) {
                assertThat(item.path("z").asDouble()).isLessThan(2.0);
                assertThat(item.path("rotation").asDouble()).isZero();
            }
        }
    }

    private String projectWithFurniture() throws Exception {
        String created = mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"의도 검증\",\"roomType\":\"거실\",\"dimensions\":{\"width\":8,\"depth\":6,\"height\":2.4}}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(created).path("id").asString();
        mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON).content(LAYOUT))
                .andExpect(status().isOk());
        return id;
    }

    private JsonNode intents(String id, String intent, String selections, int expected) throws Exception {
        String body = "{\"intent\":{\"version\":1,\"intents\":[" + intent + "]}"
                + (selections == null ? "" : ",\"selections\":" + selections) + "}";
        return send(id, "/layout/intents", body, expected);
    }

    private JsonNode send(String id, String path, String body, int expected) throws Exception {
        String response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/projects/{id}" + path, id).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response);
    }

    private JsonNode project(String id) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/projects/{id}", id)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private java.util.List<String> furnitureIds(JsonNode project) {
        java.util.List<String> ids = new java.util.ArrayList<>();
        for (JsonNode item : project.path("furniture")) ids.add(item.path("id").asString());
        return ids;
    }
}
