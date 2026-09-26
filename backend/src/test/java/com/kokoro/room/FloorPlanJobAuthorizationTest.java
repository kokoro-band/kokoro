package com.kokoro.room;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.JwtDecoder;
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

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://issuer.example.test")
@AutoConfigureMockMvc
@ActiveProfiles("prod")
@Testcontainers
class FloorPlanJobAuthorizationTest {
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
    void onlyOwnerCanReadJobAndStoragePathsAreNeverExposed() throws Exception {
        String projectId = createProject("alice");
        var file = new MockMultipartFile("file", "plan.pdf", "application/pdf", "%PDF-1.7\n".getBytes());
        String upload = mvc.perform(multipart("/api/projects/{id}/floor-plan", projectId)
                        .file(file).with(jwt().jwt(token -> token.subject("alice"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.floorPlan.objectKey").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String jobId = mapper.readTree(upload).path("floorPlan").path("jobId").asString();
        String path = "/api/projects/{projectId}/floor-plan/jobs/{jobId}";

        mvc.perform(get(path, projectId, jobId).with(jwt().jwt(token -> token.subject("alice"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value(jobId))
                .andExpect(jsonPath("$.objectKey").doesNotExist());
        mvc.perform(get(path, projectId, jobId).with(jwt().jwt(token -> token.subject("bob"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.objectKey").doesNotExist());
        mvc.perform(get(path, projectId, jobId)).andExpect(status().isUnauthorized());

        String secondProject = createProject("alice");
        mvc.perform(get(path, secondProject, jobId).with(jwt().jwt(token -> token.subject("alice"))))
                .andExpect(status().isNotFound());
        mvc.perform(get(path, "missing-project", jobId).with(jwt().jwt(token -> token.subject("alice"))))
                .andExpect(status().isNotFound());
    }

    private String createProject(String owner) throws Exception {
        String response = mvc.perform(post("/api/projects").with(jwt().jwt(token -> token.subject(owner)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"권한 검사","roomType":"거실","dimensions":{"width":5,"depth":4,"height":2.4}}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asString();
    }
}
