package com.kokoro.room;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://issuer.example.test")
@AutoConfigureMockMvc
@ActiveProfiles("prod")
@Testcontainers
class ProjectProdAccessTest {
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
    @MockitoBean JwtDecoder decoder;
    @MockitoBean com.kokoro.room.project.FloorPlanJobDispatcher dispatcher;

    @Test
    void anonymousRequestsAreRejectedInsteadOfFallingBackToLocalUser() throws Exception {
        String id = createProject("alice");

        mvc.perform(get("/api/projects")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/projects/{id}", id)).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/projects/{id}/layout", id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"furniture\":[]}")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/projects/{id}", id)).andExpect(status().isUnauthorized());

        mvc.perform(get("/api/projects/{id}", id).with(user("alice"))).andExpect(status().isOk());
    }

    @Test
    void otherUsersCannotReadChangeOrDeleteAndProjectSurvives() throws Exception {
        String id = createProject("alice");
        String otherId = createProject("local-user");

        mvc.perform(get("/api/projects/{id}", id).with(user("bob"))).andExpect(status().isNotFound());
        mvc.perform(put("/api/projects/{id}/layout", id).with(user("bob")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"furniture\":[]}")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/projects/{id}", id).with(user("bob"))).andExpect(status().isNotFound());

        mvc.perform(get("/api/projects/{id}", id).with(user("alice"))).andExpect(status().isOk());
        mvc.perform(get("/api/projects/{id}", otherId).with(user("alice"))).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects").with(user("alice")))
                .andExpect(jsonPath("$[*].id", hasItem(id)))
                .andExpect(jsonPath("$[*].id", not(hasItem(otherId))));
    }

    private static RequestPostProcessor user(String subject) {
        return jwt().jwt(token -> token.subject(subject));
    }

    private String createProject(String owner) throws Exception {
        String response = mvc.perform(post("/api/projects").with(user(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"권한 검사","roomType":"거실","dimensions":{"width":5,"depth":4,"height":2.4}}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asString();
    }
}
