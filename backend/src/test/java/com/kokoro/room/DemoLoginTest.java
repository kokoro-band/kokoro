package com.kokoro.room;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;

import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
@Testcontainers
class DemoLoginTest {
    // Test-only values. Real accounts and keys come from environment variables on the server.
    static final String SECRET = "demo-test-signing-key-0123456789abcdef";
    static final BCryptPasswordEncoder ENCODER = new BCryptPasswordEncoder();

    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @TempDir static Path storage;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("app.floor-plan-storage-root", () -> storage.toString());
        registry.add("app.security.demo.jwt-secret", () -> SECRET);
        registry.add("app.security.demo.accounts",
                () -> "alice:" + ENCODER.encode("alice-pass") + ",bob:" + ENCODER.encode("bob-pass"));
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean com.kokoro.room.project.FloorPlanJobDispatcher dispatcher;

    @Test
    void registeredAccountGetsTokenThatOpensTheApi() throws Exception {
        String token = login("alice", "alice-pass");

        mvc.perform(get("/api/projects").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(get("/api/projects")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/health")).andExpect(status().isOk());
    }

    @Test
    void wrongPasswordOrUnknownAccountGetsNoToken() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"alice\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.token").doesNotExist());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"mallory\",\"password\":\"alice-pass\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void accountsCannotSeeEachOthersProjects() throws Exception {
        String alice = login("alice", "alice-pass");
        String bob = login("bob", "bob-pass");
        String response = mvc.perform(post("/api/projects").header("Authorization", "Bearer " + alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"시연","roomType":"거실","dimensions":{"width":5,"depth":4,"height":2.4}}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(response).path("id").asString();

        mvc.perform(get("/api/projects/{id}", id).header("Authorization", "Bearer " + bob)).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/{id}", id).header("Authorization", "Bearer " + alice)).andExpect(status().isOk());
    }

    @Test
    void forgedTokenIsRejected() throws Exception {
        String token = login("alice", "alice-pass");
        String forged = token.substring(0, token.lastIndexOf('.') + 1) + "invalidsignature";

        mvc.perform(get("/api/projects").header("Authorization", "Bearer " + forged)).andExpect(status().isUnauthorized());
    }

    private String login(String username, String password) throws Exception {
        String response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(java.util.Map.of("username", username, "password", password))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", not(emptyOrNullString())))
                .andExpect(jsonPath("$.username").value(username))
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("token").asString();
    }
}
