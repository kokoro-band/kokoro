package com.kokoro.room;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FurnitureRotationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;

    @TestFactory
    List<DynamicTest> preservesSharedRotationsThroughSaveGetListAndRoomUpdate() throws Exception {
        var tests = new ArrayList<DynamicTest>();
        for (JsonNode angle : fixture().path("accepted")) {
            tests.add(DynamicTest.dynamicTest("rotation " + angle, () -> {
                String id = createProject();
                double expected = angle.doubleValue();
                JsonNode saved = save(id, angle, 200);
                assertEquals(expected, saved.path("furniture").get(0).path("rotation").doubleValue());
                assertRotation(id, expected);
                JsonNode listed = mapper.readTree(mvc.perform(get("/api/projects")).andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString());
                JsonNode listedProject = null;
                for (JsonNode project : listed) if (project.path("id").asText().equals(id)) listedProject = project;
                assertNotNull(listedProject);
                assertEquals(expected, listedProject.path("furniture").get(0).path("rotation").doubleValue());
                mvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON)
                                .content(mapper.writeValueAsString(Map.of("room", fixture().path("motion").path("room")))))
                        .andExpect(status().isOk());
                assertRotation(id, expected);
            }));
        }
        return tests;
    }

    @Test
    void movingFurnitureDoesNotRoundItsStoredAngle() throws Exception {
        String id = createProject();
        save(id, mapper.valueToTree(25.25), 200);
        mvc.perform(post("/api/projects/{id}/layout/commands", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"의자를 이동해줘\"}"))
                .andExpect(status().isOk());
        assertRotation(id, 25.25);
        assertEquals(3.0, read(id).path("furniture").get(0).path("x").doubleValue());
    }

    @Test
    void invalidAnglesDoNotReplaceExistingFurniture() throws Exception {
        String id = createProject();
        save(id, mapper.valueToTree(0), 200);
        JsonNode before = read(id);
        for (JsonNode angle : fixture().path("rejected")) {
            save(id, angle, 400);
            assertEquals(before, read(id));
        }
        for (String rawAngle : List.of("\"NaN\"", "\"Infinity\"", "\"-Infinity\"", "1e309")) {
            String body = "{\"furniture\":[{\"id\":\"chair\",\"catalogId\":\"chair-shell\",\"name\":\"의자\",\"category\":\"의자\",\"x\":3,\"z\":3,\"rotation\":" + rawAngle + ",\"color\":\"#000000\"}]}";
            mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
            assertEquals(before, read(id));
        }
    }

    @Test
    void migrationKeepsExistingIntegerAnglesAndAllowsFractions() throws Exception {
        String schema = "rotation_legacy";
        Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .schemas(schema).defaultSchema(schema).target("7").load().migrate();
        int[] original = {Integer.MIN_VALUE, -90, 0, 25, Integer.MAX_VALUE};
        try (var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
            connection.setSchema(schema);
            try (var statement = connection.createStatement()) {
                statement.executeUpdate("INSERT INTO projects(id, owner_id, name, room_type, width, depth, height, updated_at) VALUES ('legacy', 'local-user', '이전', '거실', 6, 6, 2.4, now())");
            }
            try (var insert = connection.prepareStatement("INSERT INTO furniture_items(project_id,id,catalog_id,name,category,x,z,rotation,color,item_order) VALUES ('legacy',?,'chair-shell','의자','의자',3,3,?,'#000000',?)")) {
                for (int index = 0; index < original.length; index++) {
                    insert.setString(1, "chair-" + index);
                    insert.setInt(2, original[index]);
                    insert.setInt(3, index);
                    insert.executeUpdate();
                }
            }
            assertEquals("integer", rotationType(connection, schema));
            Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                    .schemas(schema).defaultSchema(schema).load().migrate();
            assertEquals("double precision", rotationType(connection, schema));
            try (var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT rotation FROM furniture_items ORDER BY item_order")) {
                for (int value : original) { assertTrue(rows.next()); assertEquals((double) value, rows.getDouble(1)); }
                assertFalse(rows.next());
            }
            try (var statement = connection.createStatement()) {
                statement.executeUpdate("UPDATE furniture_items SET rotation=25.25 WHERE id='chair-0'");
                try (var rows = statement.executeQuery("SELECT rotation FROM furniture_items WHERE id='chair-0'")) {
                    assertTrue(rows.next()); assertEquals(25.25, rows.getDouble(1));
                }
            }
        }
    }

    private String rotationType(java.sql.Connection connection, String schema) throws Exception {
        try (var statement = connection.prepareStatement("SELECT data_type FROM information_schema.columns WHERE table_schema=? AND table_name='furniture_items' AND column_name='rotation'")) {
            statement.setString(1, schema);
            try (var rows = statement.executeQuery()) { assertTrue(rows.next()); return rows.getString(1); }
        }
    }

    private JsonNode save(String id, JsonNode rotation, int status) throws Exception {
        ObjectNode item = (ObjectNode) fixture().path("motion").path("item").deepCopy();
        item.set("rotation", rotation);
        String response = mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("furniture", List.of(item)))))
                .andExpect(status().is(status)).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response);
    }

    private void assertRotation(String id, double expected) throws Exception {
        assertEquals(expected, read(id).path("furniture").get(0).path("rotation").doubleValue());
    }
    private JsonNode read(String id) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/projects/{id}", id)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }
    private String createProject() throws Exception {
        return mapper.readTree(mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"회전\",\"roomType\":\"거실\",\"dimensions\":{\"width\":6,\"depth\":6,\"height\":2.4}}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asText();
    }
    private JsonNode fixture() throws Exception {
        try (var input = getClass().getResourceAsStream("/contracts/furniture-rotation.json")) { return mapper.readTree(input); }
    }
}
