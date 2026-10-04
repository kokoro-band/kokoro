package com.kokoro.room;

import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProjectInputBoundaryTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("kokoro").withUsername("kokoro").withPassword("kokoro");
    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.datasource.driver-class-name", postgres::getDriverClassName);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired FurniturePlacementValidator validator;

    @TestFactory
    List<DynamicTest> sharedStringBoundaries() throws Exception {
        var tests = new ArrayList<DynamicTest>();
        for (JsonNode fixture : fixtures().path("strings")) {
            tests.add(DynamicTest.dynamicTest(fixture.path("id").asText(), () -> {
                String field = fixture.path("field").asText();
                String value = fixture.path("prefix").asText("")
                        + fixture.path("unit").asText().repeat(fixture.path("repeat").asInt());
                boolean accepted = fixture.path("server").asBoolean();
                if (field.equals("message")) {
                    String id = createProject();
                    JsonNode before = read(id);
                    int proposals = count("layout_proposals");
                    var response = mvc.perform(post("/api/projects/{id}/layout/commands", id)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(Map.of("message", value))))
                            .andExpect(status().is(accepted ? 200 : 400));
                    if (!accepted) response.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("요청")));
                    assertEquals(before, read(id));
                    assertEquals(proposals, count("layout_proposals"));
                } else {
                    var body = mapper.createObjectNode().put("name", "경계 테스트").put("roomType", "거실");
                    body.set("dimensions", mapper.valueToTree(new Dimensions(6, 5, 2.4)));
                    body.put(field, value);
                    int before = count("projects");
                    var response = mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(body)))
                            .andExpect(status().is(accepted ? 201 : 400));
                    if (accepted) {
                        JsonNode result = mapper.readTree(response.andReturn().getResponse().getContentAsString());
                        assertEquals(value, read(result.path("id").asText()).path(field).asText());
                    } else {
                        response.andExpect(jsonPath("$.detail").isString());
                        assertEquals(before, count("projects"));
                    }
                }
            }));
        }
        return tests;
    }

    @Test
    void manualSaveCountBoundariesPreserveStoredState() throws Exception {
        String id = createProject();
        for (JsonNode fixture : fixtures().path("furniture")) {
            JsonNode before = read(id);
            boolean accepted = fixture.path("accepted").asBoolean();
            int count = fixture.path("count").asInt();
            var result = mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(Map.of("furniture", furniture(count)))))
                    .andExpect(status().is(accepted ? 200 : 400));
            if (accepted) assertEquals(count, read(id).path("furniture").size());
            else {
                result.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("200")));
                assertEquals(before, read(id));
            }
        }
    }

    @Test
    void aiAdditionRejects201BeforeGeometryAndDoesNotChange200Items() throws Exception {
        String id = createProject();
        mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("furniture", furniture(200)))))
                .andExpect(status().isOk());
        JsonNode before = read(id);
        mvc.perform(post("/api/projects/{id}/layout/commands", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("message", "소파를 배치해줘"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("200")));
        assertEquals(before, read(id));
    }

    @Test
    void countIsCheckedBeforeCatalogOrGeometryInBothEntryPoints() {
        var invalidItems = IntStream.range(0, 201).mapToObj(i -> new FurnitureItem(
                "item-" + i, "missing-catalog", "의자", "의자", 1.0, 1.0, 0.0, "#000000")).toList();
        assertTrue(assertThrows(ResponseStatusException.class, () -> validator.validateData(invalidItems)).getReason().contains("200"));
        assertTrue(assertThrows(ResponseStatusException.class, () -> validator.validate(new Dimensions(6, 5, 2.4), null, invalidItems)).getReason().contains("200"));
    }

    private List<FurnitureItem> furniture(int count) {
        return IntStream.range(0, count).mapToObj(i -> new FurnitureItem(
                "item-" + i, "chair-shell", "의자", "의자", 1.0, 1.0, 0.0, "#000000")).toList();
    }

    @TestFactory
    List<DynamicTest> sharedFurnitureFieldBoundaries() throws Exception {
        var tests = new ArrayList<DynamicTest>();
        JsonNode source = furnitureFixtures();
        for (String group : List.of("strings", "numbers")) {
            for (JsonNode fixture : source.path(group)) {
                tests.add(DynamicTest.dynamicTest(fixture.path("id").asText(), () -> {
                    String id = createProject();
                    mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                                    .content(mapper.writeValueAsString(Map.of("furniture", furniture(1)))))
                            .andExpect(status().isOk());
                    JsonNode before = read(id);
                    var item = mapper.valueToTree(furniture(1).get(0));
                    var body = (tools.jackson.databind.node.ObjectNode) item;
                    String field = fixture.path("field").asText();
                    if (group.equals("strings")) body.put(field, fixture.path("unit").asText().repeat(fixture.path("repeat").asInt()));
                    else body.set(field, fixture.path("value"));
                    boolean accepted = fixture.path("accepted").asBoolean();
                    var result = mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                                    .content(mapper.writeValueAsString(Map.of("furniture", List.of(body)))))
                            .andExpect(status().is(accepted ? 200 : 400));
                    if (accepted) assertEquals(mapper.treeToValue(body, FurnitureItem.class),
                            mapper.treeToValue(read(id).path("furniture").get(0), FurnitureItem.class));
                    else {
                        result.andExpect(jsonPath("$.detail").isString());
                        assertEquals(before, read(id));
                    }
                }));
            }
        }
        return tests;
    }

    @TestFactory
    List<DynamicTest> projectDimensionBoundaries() throws Exception {
        var tests = new ArrayList<DynamicTest>();
        for (JsonNode fixture : furnitureFixtures().path("dimensions")) {
            tests.add(DynamicTest.dynamicTest(fixture.toString(), () -> {
                var dimensions = mapper.createObjectNode().put("width", 6).put("depth", 5).put("height", 2.4);
                dimensions.set(fixture.path("field").asText(), fixture.path("value"));
                int before = count("projects");
                boolean accepted = fixture.path("accepted").asBoolean();
                mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON)
                                .content(mapper.writeValueAsString(Map.of("name", "치수", "roomType", "거실", "dimensions", dimensions))))
                        .andExpect(status().is(accepted ? 201 : 400));
                assertEquals(before + (accepted ? 1 : 0), count("projects"));
            }));
        }
        return tests;
    }

    @Test
    void rejectsNullFurnitureWithoutChangingProject() throws Exception {
        String id = createProject();
        JsonNode before = read(id);
        for (String json : List.of("{\"furniture\":null}", "{\"furniture\":[null]}")) {
            mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON).content(json))
                    .andExpect(status().isBadRequest());
            assertEquals(before, read(id));
        }
    }

    @Test
    void rejectsOversizedWallThicknessWithoutChangingProject() throws Exception {
        String id = createProject();
        JsonNode before = read(id);
        JsonNode room;
        try (var input = getClass().getResourceAsStream("/contracts/room-v2.json")) {
            room = mapper.readTree(input).path("room");
        }
        ((tools.jackson.databind.node.ObjectNode) room.path("walls").get(0)).put("thickness", 200.01);
        mvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("room", room))))
                .andExpect(status().isBadRequest());
        assertEquals(before, read(id));
    }

    private JsonNode furnitureFixtures() throws Exception {
        try (var input = getClass().getResourceAsStream("/contracts/furniture-input-boundaries.json")) {
            return mapper.readTree(input);
        }
    }

    @Test
    void sharedTextGuardAlsoRejectsNullBytesInProjectFieldsAndMessages() throws Exception {
        for (String field : List.of("name", "roomType")) {
            var body = mapper.createObjectNode().put("name", "이름").put("roomType", "거실");
            body.put(field, "값\0");
            body.set("dimensions", mapper.valueToTree(new Dimensions(6, 5, 2.4)));
            int before = count("projects");
            mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(body)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").isString());
            assertEquals(before, count("projects"));
        }
        String id = createProject();
        JsonNode before = read(id);
        mvc.perform(post("/api/projects/{id}/layout/commands", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("message", "소파\0"))))
                .andExpect(status().isBadRequest());
        assertEquals(before, read(id));
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }

    private JsonNode fixtures() throws Exception {
        try (var input = getClass().getResourceAsStream("/contracts/input-boundaries.json")) {
            return mapper.readTree(input);
        }
    }

    private String createProject() throws Exception {
        String body = mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"경계 테스트\",\"roomType\":\"거실\",\"dimensions\":{\"width\":6,\"depth\":5,\"height\":2.4}}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).path("id").asText();
    }

    private JsonNode read(String id) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/projects/{id}", id)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }
}
