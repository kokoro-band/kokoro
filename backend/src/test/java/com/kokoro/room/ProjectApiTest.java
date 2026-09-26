package com.kokoro.room;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProjectApiTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("kokoro")
            .withUsername("kokoro")
            .withPassword("kokoro");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.datasource.driver-class-name", postgres::getDriverClassName);
    }

    @Autowired MockMvc mockMvc;
    @Autowired tools.jackson.databind.ObjectMapper mapper;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Test
    void placementErrorIdentifiesTheWallAndDoesNotChangeStoredState() throws Exception {
        String created = mockMvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"벽 검증","roomType":"거실","dimensions":{"width":6,"depth":4,"height":2.4}}
                """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(created).path("id").asString();
        var room = mapper.readTree(getClass().getResourceAsStream("/contracts/room-v2.json")).path("room");
        String before = mockMvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode().set("room", room))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        mockMvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON).content("""
                {"furniture":[{"id":"blocked-chair","catalogId":"chair-shell","name":"의자","category":"의자",
                 "x":0.4,"z":2,"rotation":0,"color":"#000000"}]}
                """))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WALL_COLLISION"))
                .andExpect(jsonPath("$.furnitureIds[0]").value("blocked-chair"))
                .andExpect(jsonPath("$.wallId").value("w-0-0-0-4"));
        String after = mockMvc.perform(get("/api/projects/{id}", id))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertEquals(mapper.readTree(before), mapper.readTree(after));
    }

    @Test
    void exposesHealthAndSampleProject() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.service").value("kokoro-remodel-api"));

        mockMvc.perform(get("/api/projects/living-room-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("성수동 거실"));
    }

    @Test
    void createsProjectUploadsPlanAndAppliesChatCommand() throws Exception {
        String response = mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"우리 집","roomType":"거실","dimensions":{"width":5.2,"depth":4.1,"height":2.4}}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = response.split("\"id\":\"")[1].split("\"")[0];

        MockMultipartFile floorPlan = new MockMultipartFile(
                "file", "plan.pdf", "application/pdf", "floor-plan".getBytes());
        String uploadResponse = mockMvc.perform(multipart("/api/projects/{id}/floor-plan", id).file(floorPlan))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.floorPlan.jobId").isNotEmpty())
                .andExpect(jsonPath("$.floorPlan.objectKey").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String jobId = uploadResponse.split("\"jobId\":\"")[1].split("\"")[0];
        awaitReady(id, jobId);

        mockMvc.perform(post("/api/projects/{id}/layout/commands", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"창가에 식물과 소파를 배치해줘\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appliedActions", hasSize(2)))
                .andExpect(jsonPath("$.project.furniture", hasSize(2)));
    }

    @Test
    void rejectsUnsupportedFloorPlanAndAllowsAnEmptyLayout() throws Exception {
        MockMultipartFile invalid = new MockMultipartFile(
                "file", "plan.txt", "text/plain", "not-a-plan".getBytes());
        mockMvc.perform(multipart("/api/projects/living-room-01/floor-plan").file(invalid))
                .andExpect(status().isBadRequest());

        mockMvc.perform(put("/api/projects/living-room-01/layout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"furniture\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.furniture", hasSize(0)));
    }

    @Test
    void persistsFurnitureOrderAndCoordinatesInPostgres() throws Exception {
        String response = mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"저장 확인","roomType":"거실","dimensions":{"width":5.0,"depth":4.0,"height":2.4}}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = response.split("\"id\":\"")[1].split("\"")[0];

        mockMvc.perform(put("/api/projects/{id}/layout", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"furniture":[
                                  {"id":"first","catalogId":"sofa-cloud","name":"소파","category":"소파","x":1.6,"z":1.2,"rotation":15,"color":"#D8C8B8"},
                                  {"id":"second","catalogId":"plant-olive","name":"화분","category":"장식","x":3.9,"z":2.8,"rotation":0,"color":"#69805E"}
                                ]}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/projects/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.furniture", hasSize(2)))
                .andExpect(jsonPath("$.furniture[0].id").value("first"))
                .andExpect(jsonPath("$.furniture[0].x").value(1.6))
                .andExpect(jsonPath("$.furniture[1].id").value("second"));
    }

    @Test
    void savesAndReloadsRoomModel() throws Exception {
        String response = mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"공간 저장","roomType":"거실","dimensions":{"width":6.0,"depth":4.0,"height":2.4}}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = response.split("\"id\":\"")[1].split("\"")[0];

        tools.jackson.databind.JsonNode expected;
        try (var fixture = getClass().getResourceAsStream("/contracts/room-v2.json")) {
            expected = mapper.readTree(fixture).path("room");
        }
        var roomRequest = mapper.createObjectNode().set("room", expected);
        String saved = mockMvc.perform(put("/api/projects/{id}/room", id)
                        .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(roomRequest)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        // JSON numeric nodes may distinguish 0 from 0.0; compare through the public DTO.
        var expectedRoom = mapper.treeToValue(expected, com.kokoro.room.project.ProjectModels.RoomModel.class);
        org.junit.jupiter.api.Assertions.assertEquals(expectedRoom,
                mapper.treeToValue(mapper.readTree(saved).path("room"), com.kokoro.room.project.ProjectModels.RoomModel.class));
        assertRoom(id, expectedRoom);

        String beforeInvalid = mockMvc.perform(get("/api/projects/{id}", id))
                .andReturn().getResponse().getContentAsString();
        var invalidRoom = expected.deepCopy();
        ((tools.jackson.databind.node.ObjectNode) invalidRoom.path("openings").get(0)).put("wallId", "missing-wall");
        mockMvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode().set("room", invalidRoom))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ROOM"))
                .andExpect(jsonPath("$.violations[0].path").value("openings[0].wallId"));
        String afterInvalid = mockMvc.perform(get("/api/projects/{id}", id))
                .andReturn().getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertEquals(mapper.readTree(beforeInvalid), mapper.readTree(afterInvalid));

        for (String invalid : java.util.List.of("[0]", "[0,0,0]", "[\"0\",0]", "{\"x\":0,\"z\":0}")) {
            var changed = expected.deepCopy();
            ((tools.jackson.databind.node.ArrayNode) changed.path("outline")).set(0, mapper.readTree(invalid));
            mockMvc.perform(put("/api/projects/{id}/room", id).contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(mapper.createObjectNode().set("room", changed))))
                    .andExpect(status().isBadRequest());
            assertRoom(id, expectedRoom);
        }

        // Simulate pre-contract data still stored as object coordinates in PostgreSQL.
        jdbc.update("UPDATE projects SET room = ?::jsonb WHERE id = ?", mapper.writeValueAsString(legacyCoordinates(expected)), id);
        assertRoom(id, expectedRoom);
        // A new repository instance has no in-memory state and must read the same persisted room.
        var reloaded = new com.kokoro.room.project.JdbcProjectRepository(jdbc, mapper).findById(id).orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals(expectedRoom, reloaded.room());
    }

    private void assertRoom(String id, com.kokoro.room.project.ProjectModels.RoomModel expected) throws Exception {
        String result = mockMvc.perform(get("/api/projects/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.room.outline[0]").isArray())
                .andExpect(jsonPath("$.room.walls[0].a").isArray())
                .andExpect(jsonPath("$.room.rooms[0].polygon[0]").isArray())
                .andExpect(jsonPath("$.room.spawn").isArray())
                .andReturn().getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertEquals(expected,
                mapper.treeToValue(mapper.readTree(result).path("room"), com.kokoro.room.project.ProjectModels.RoomModel.class));
    }

    private tools.jackson.databind.JsonNode legacyCoordinates(tools.jackson.databind.JsonNode node) {
        if (node.isArray()) {
            if (node.size() == 2 && node.get(0).isNumber() && node.get(1).isNumber()) {
                return mapper.createObjectNode().set("x", node.get(0)).set("z", node.get(1));
            }
            var array = mapper.createArrayNode();
            node.forEach(value -> array.add(legacyCoordinates(value)));
            return array;
        }
        if (node.isObject()) {
            var object = mapper.createObjectNode();
            node.properties().forEach(entry -> object.set(entry.getKey(), legacyCoordinates(entry.getValue())));
            return object;
        }
        return node;
    }

    @Test
    void rejectsFurnitureOutsideRoomAndOverlappingFurniture() throws Exception {
        mockMvc.perform(put("/api/projects/{id}/layout", "living-room-01")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"furniture":[
                                  {"id":"outside","catalogId":"sofa-cloud","name":"소파","category":"소파","x":0.5,"z":2.1,"rotation":0,"color":"#D8C8B8"}
                                ]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("방 경계")));

        mockMvc.perform(put("/api/projects/{id}/layout", "living-room-01")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"furniture":[
                                  {"id":"chair-1","catalogId":"chair-shell","name":"의자","category":"의자","x":2.9,"z":2.1,"rotation":45,"color":"#4A665A"},
                                  {"id":"chair-2","catalogId":"chair-shell","name":"의자","category":"의자","x":3.2,"z":2.1,"rotation":0,"color":"#4A665A"}
                                ]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("겹칩니다")));
    }

    private void awaitReady(String projectId, String jobId) throws Exception {
        for (int attempt = 0; attempt < 20; attempt++) {
            String response = mockMvc.perform(get("/api/projects/{projectId}/floor-plan/jobs/{jobId}", projectId, jobId))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            if (response.contains("\"status\":\"READY\"")) return;
            Thread.sleep(25);
        }
        throw new AssertionError("도면 변환 작업이 READY 상태가 되지 않았습니다.");
    }
}
