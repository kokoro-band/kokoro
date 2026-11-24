package com.kokoro.room;

import com.kokoro.room.project.FloorPlanJobDispatcher;
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

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Ownership of the layout intent API and of the proposals it creates, with the production security profile. */
@SpringBootTest(properties = "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://issuer.example.test")
@AutoConfigureMockMvc
@ActiveProfiles("prod")
@Testcontainers
class LayoutIntentProdAccessTest {
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
    @MockitoBean FloorPlanJobDispatcher dispatcher;

    private static final String INTENT = "{\"intent\":{\"version\":1,\"intents\":[{\"type\":\"REMOVE\",\"targetQuery\":\"의자\"}]}}";

    @Test
    void onlyTheOwnerCanProposeAndConfirmAndAnonymousIsRejected() throws Exception {
        String id = projectWithAChair("alice");

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

    private String projectWithAChair(String owner) throws Exception {
        String created = mvc.perform(post("/api/projects").with(user(owner)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"제안 권한\",\"roomType\":\"거실\",\"dimensions\":{\"width\":8,\"depth\":6,\"height\":2.4}}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(created).path("id").asString();
        mvc.perform(put("/api/projects/{id}/layout", id).with(user(owner)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"furniture\":[{\"id\":\"chair-a\",\"catalogId\":\"chair-shell\",\"name\":\"셸 체어\",\"category\":\"의자\",\"x\":1.0,\"z\":1.0,\"rotation\":0,\"color\":\"#4A665A\"}]}"))
                .andExpect(status().isOk());
        return id;
    }
}
