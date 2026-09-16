package com.kokoro.room;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ProjectApiTest {
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
}
