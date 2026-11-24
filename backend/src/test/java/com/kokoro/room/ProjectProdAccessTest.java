package com.kokoro.room;

import com.kokoro.room.project.FloorPlanJobDispatcher;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://issuer.example.test")
@AutoConfigureMockMvc
@ActiveProfiles("prod")
class ProjectProdAccessTest {
    @TempDir static Path storage;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        SharedPostgres.register(registry, "prod_access");
        registry.add("app.floor-plan-storage-root", () -> storage.toString());
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean FloorPlanJobDispatcher dispatcher;

    private static final String INTENT = "{\"intent\":{\"version\":1,\"intents\":[{\"type\":\"REMOVE\",\"targetQuery\":\"의자\"}]}}";

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

    @Test
    void furnitureCatalogRequiresALoginAndListsTheSharedItems() throws Exception {
        mvc.perform(get("/api/furniture-catalog")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/furniture-catalog").with(user("alice")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(20));
    }

    @Test
    void onlyOwnerCanReadFloorPlanJobAndStoragePathsAreNeverExposed() throws Exception {
        String projectId = createProject("alice");
        mvc.perform(multipart("/api/projects/{id}/floor-plan", projectId)
                        .file(new MockMultipartFile("file", "bad.txt", "text/plain", "invalid".getBytes()))
                        .with(user("bob")))
                .andExpect(status().isNotFound());
        var file = new MockMultipartFile("file", "plan.pdf", "application/pdf", "%PDF-1.7\n".getBytes());
        String upload = mvc.perform(multipart("/api/projects/{id}/floor-plan", projectId)
                        .file(file).with(user("alice")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.floorPlan.objectKey").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String jobId = mapper.readTree(upload).path("floorPlan").path("jobId").asString();
        String path = "/api/projects/{projectId}/floor-plan/jobs/{jobId}";

        mvc.perform(get(path, projectId, jobId).with(user("alice")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value(jobId))
                .andExpect(jsonPath("$.objectKey").doesNotExist());
        mvc.perform(get(path, projectId, jobId).with(user("bob")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.objectKey").doesNotExist());
        mvc.perform(get(path, projectId, jobId)).andExpect(status().isUnauthorized());

        String secondProject = createProject("alice");
        mvc.perform(get(path, secondProject, jobId).with(user("alice")))
                .andExpect(status().isNotFound());
        mvc.perform(get(path, "missing-project", jobId).with(user("alice")))
                .andExpect(status().isNotFound());
    }

    @Test
    void onlyTheOwnerCanProposeAndConfirmLayoutIntentsAndAnonymousIsRejected() throws Exception {
        String id = createProject("alice");
        mvc.perform(put("/api/projects/{id}/layout", id).with(user("alice")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"furniture\":[{\"id\":\"chair-a\",\"catalogId\":\"chair-shell\",\"name\":\"셸 체어\",\"category\":\"의자\",\"x\":1.0,\"z\":1.0,\"rotation\":0,\"color\":\"#4A665A\"}]}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/projects/{id}/layout/intents", id).contentType(MediaType.APPLICATION_JSON).content(INTENT))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/projects/{id}/layout/intents", id).with(user("bob"))
                        .contentType(MediaType.APPLICATION_JSON).content(INTENT))
                .andExpect(status().isNotFound());

        String proposal = mvc.perform(post("/api/projects/{id}/layout/intents", id).with(user("alice"))
                        .contentType(MediaType.APPLICATION_JSON).content(INTENT))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String proposalId = mapper.readTree(proposal).path("proposalId").asString();
        String confirm = "{\"proposalId\":\"" + proposalId + "\"}";

        mvc.perform(post("/api/projects/{id}/layout/commands/confirm", id).with(user("bob"))
                        .contentType(MediaType.APPLICATION_JSON).content(confirm))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/{id}", id).with(user("alice")))
                .andExpect(jsonPath("$.furniture.length()").value(1));

        mvc.perform(post("/api/projects/{id}/layout/commands/confirm", id).with(user("alice"))
                        .contentType(MediaType.APPLICATION_JSON).content(confirm))
                .andExpect(status().isOk()).andExpect(jsonPath("$.project.furniture.length()").value(0));
    }

    private static RequestPostProcessor user(String subject) {
        return jwt().jwt(token -> token.subject(subject));
    }

    private String createProject(String owner) throws Exception {
        String response = mvc.perform(post("/api/projects").with(user(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"권한 검사","roomType":"거실","dimensions":{"width":8,"depth":6,"height":2.4}}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asString();
    }
}
