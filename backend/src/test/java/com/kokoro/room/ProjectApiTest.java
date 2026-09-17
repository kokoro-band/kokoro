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
        mockMvc.perform(multipart("/api/projects/{id}/floor-plan", id).file(floorPlan))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.floorPlan.status").value("READY"));

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
                                  {"id":"first","catalogId":"sofa-cloud","name":"소파","category":"소파","x":12.5,"z":30.0,"rotation":15,"color":"#D8C8B8"},
                                  {"id":"second","catalogId":"plant-olive","name":"화분","category":"장식","x":80.0,"z":70.0,"rotation":0,"color":"#69805E"}
                                ]}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/projects/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.furniture", hasSize(2)))
                .andExpect(jsonPath("$.furniture[0].id").value("first"))
                .andExpect(jsonPath("$.furniture[0].x").value(12.5))
                .andExpect(jsonPath("$.furniture[1].id").value("second"));
    }
}
