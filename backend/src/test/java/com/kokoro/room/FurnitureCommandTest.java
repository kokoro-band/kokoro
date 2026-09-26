package com.kokoro.room;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Timestamp;
import java.time.Instant;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** issue #9: rule-based target selection and the destructive-command confirm contract. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FurnitureCommandTest {
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
    @Autowired JdbcTemplate jdbc;

    private String createProject() throws Exception {
        String response = mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"우리 집","roomType":"거실","dimensions":{"width":6,"depth":5,"height":2.4}}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return response.split("\"id\":\"")[1].split("\"")[0];
    }

    private void putTwoChairs(String id) throws Exception {
        mockMvc.perform(put("/api/projects/{id}/layout", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"furniture":[
                                  {"id":"chair-a","catalogId":"chair-shell","name":"의자A","category":"의자","x":1,"z":1,"rotation":0,"color":"#000000"},
                                  {"id":"chair-b","catalogId":"chair-shell","name":"의자B","category":"의자","x":4,"z":4,"rotation":0,"color":"#000000"}
                                ]}
                                """))
                .andExpect(status().isOk());
    }

    @Test
    void ambiguousTargetReturnsCandidatesWithoutApplying() throws Exception {
        String id = createProject();
        putTwoChairs(id);

        mockMvc.perform(post("/api/projects/{id}/layout/commands", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"의자를 90도 회전해줘\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appliedActions", hasSize(0)))
                .andExpect(jsonPath("$.candidates", hasSize(2)));
    }

    @Test
    void explicitFurnitureIdResolvesAmbiguousTarget() throws Exception {
        String id = createProject();
        putTwoChairs(id);

        mockMvc.perform(post("/api/projects/{id}/layout/commands", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"의자를 90도 회전해줘\",\"furnitureId\":\"chair-a\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appliedActions", hasSize(1)));
    }

    @Test
    void missingTargetIsRejected() throws Exception {
        String id = createProject();

        mockMvc.perform(post("/api/projects/{id}/layout/commands", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"의자를 90도 회전해줘\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void clearRequiresConfirmationThenAppliesOnce() throws Exception {
        String id = createProject();
        putTwoChairs(id);

        String proposeResponse = mockMvc.perform(post("/api/projects/{id}/layout/commands", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"가구를 모두 비워줘\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requiresConfirmation").value(true))
                .andExpect(jsonPath("$.proposalId").isNotEmpty())
                .andExpect(jsonPath("$.project.furniture", hasSize(2)))
                .andReturn().getResponse().getContentAsString();
        String proposalId = proposeResponse.split("\"proposalId\":\"")[1].split("\"")[0];

        mockMvc.perform(post("/api/projects/{id}/layout/commands/confirm", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\":\"" + proposalId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appliedActions", hasSize(1)))
                .andExpect(jsonPath("$.project.furniture", hasSize(0)));

        // Resending the same proposal id must not fail and must not re-run the clear.
        mockMvc.perform(post("/api/projects/{id}/layout/commands/confirm", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\":\"" + proposalId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appliedActions", hasSize(0)))
                .andExpect(jsonPath("$.project.furniture", hasSize(0)));
    }

    @Test
    void expiredProposalIsRejected() throws Exception {
        String id = createProject();
        putTwoChairs(id);

        String proposeResponse = mockMvc.perform(post("/api/projects/{id}/layout/commands", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"가구를 모두 비워줘\"}"))
                .andReturn().getResponse().getContentAsString();
        String proposalId = proposeResponse.split("\"proposalId\":\"")[1].split("\"")[0];

        jdbc.update("UPDATE layout_proposals SET expires_at = ? WHERE proposal_id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), proposalId);

        mockMvc.perform(post("/api/projects/{id}/layout/commands/confirm", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\":\"" + proposalId + "\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void staleProposalIsRejectedAfterLayoutChanges() throws Exception {
        String id = createProject();
        putTwoChairs(id);

        String proposeResponse = mockMvc.perform(post("/api/projects/{id}/layout/commands", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"가구를 모두 비워줘\"}"))
                .andReturn().getResponse().getContentAsString();
        String proposalId = proposeResponse.split("\"proposalId\":\"")[1].split("\"")[0];

        mockMvc.perform(put("/api/projects/{id}/layout", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"furniture":[
                                  {"id":"chair-a","catalogId":"chair-shell","name":"의자A","category":"의자","x":2,"z":2,"rotation":0,"color":"#000000"}
                                ]}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/projects/{id}/layout/commands/confirm", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\":\"" + proposalId + "\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void proposalOwnedByAnotherUserIsNotFound() throws Exception {
        String id = createProject();
        putTwoChairs(id);

        String proposeResponse = mockMvc.perform(post("/api/projects/{id}/layout/commands", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"가구를 모두 비워줘\"}"))
                .andReturn().getResponse().getContentAsString();
        String proposalId = proposeResponse.split("\"proposalId\":\"")[1].split("\"")[0];

        jdbc.update("UPDATE layout_proposals SET owner_id = 'someone-else' WHERE proposal_id = ?", proposalId);

        mockMvc.perform(post("/api/projects/{id}/layout/commands/confirm", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\":\"" + proposalId + "\"}"))
                .andExpect(status().isNotFound());
    }
}
