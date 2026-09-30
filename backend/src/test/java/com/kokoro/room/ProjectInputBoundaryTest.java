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
                "item-" + i, "missing-catalog", "의자", "의자", 1.0, 1.0, 0, "#000000")).toList();
        assertTrue(assertThrows(ResponseStatusException.class, () -> validator.validateData(invalidItems)).getReason().contains("200"));
        assertTrue(assertThrows(ResponseStatusException.class, () -> validator.validate(new Dimensions(6, 5, 2.4), null, invalidItems)).getReason().contains("200"));
    }

    private List<FurnitureItem> furniture(int count) {
        return IntStream.range(0, count).mapToObj(i -> new FurnitureItem(
                "item-" + i, "chair-shell", "의자", "의자", 1.0, 1.0, 0, "#000000")).toList();
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
