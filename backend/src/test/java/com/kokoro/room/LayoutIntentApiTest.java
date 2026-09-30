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
