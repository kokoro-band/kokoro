package com.kokoro.room;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
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
class SignupTest {
    // Test-only values. Real accounts and keys come from environment variables on the server.
    static final String SECRET = "signup-test-signing-key-0123456789abcdef";
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
        registry.add("app.security.demo.accounts", () -> "kokoro-demo:" + ENCODER.encode("demo-pass-1"));
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean com.kokoro.room.project.FloorPlanJobDispatcher dispatcher;

    @Test
    void signingUpReturnsATokenThatOpensTheApiAndLoginWorksAfterwards() throws Exception {
        String token = signUp("maker-01", "correct-horse");

        mvc.perform(get("/api/projects").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(login("maker-01", "correct-horse")).andExpect(status().isOk())
                .andExpect(jsonPath("$.token", not(emptyOrNullString())))
                .andExpect(jsonPath("$.username").value("maker-01"));
        mvc.perform(login("maker-01", "wrong-horse")).andExpect(status().isUnauthorized());
        mvc.perform(login("nobody-01", "correct-horse")).andExpect(status().isUnauthorized());
    }

    @Test
    void passwordsAreStoredAsBcryptHashesNeverAsPlainText() throws Exception {
        signUp("hashed-user", "plain-secret-1");

        String stored = jdbc.queryForObject("SELECT password_hash FROM app_users WHERE username = ?", String.class, "hashed-user");

        assertThat(stored).startsWith("$2").isNotEqualTo("plain-secret-1");
        assertThat(ENCODER.matches("plain-secret-1", stored)).isTrue();
    }

    @Test
    void usernamesIgnoreCaseWhenSigningUpAndLoggingIn() throws Exception {
        signUp("Mixed_Case", "correct-horse");

        mvc.perform(login("MIXED_CASE", "correct-horse")).andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("mixed_case"));
        mvc.perform(signup("mixed_case", "another-pass-1")).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_users WHERE username = 'mixed_case'", Integer.class)).isEqualTo(1);
    }

    @Test
    void aConfiguredDemoAccountNameCannotBeTaken() throws Exception {
        mvc.perform(signup("kokoro-demo", "correct-horse")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail", containsString("이미")));
    }

    @Test
    void invalidUsernamesAndPasswordsAreRejectedWithAReason() throws Exception {
        mvc.perform(signup("ab", "correct-horse")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("아이디")));
        mvc.perform(signup("has space", "correct-horse")).andExpect(status().isBadRequest());
        mvc.perform(signup("한글아이디", "correct-horse")).andExpect(status().isBadRequest());
        mvc.perform(signup("a".repeat(33), "correct-horse")).andExpect(status().isBadRequest());
        mvc.perform(signup("short-pass", "1234567")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("비밀번호")));
        // bcrypt only reads the first 72 bytes, so longer passwords would silently match a prefix.
        mvc.perform(signup("long-pass", "p".repeat(73))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_users WHERE username IN ('ab','short-pass','long-pass')", Integer.class)).isZero();
    }

    @Test
    void newAccountsCannotSeeEachOthersProjects() throws Exception {
        String alice = signUp("alice-iso", "correct-horse");
        String bob = signUp("bob-iso", "correct-horse");
        String response = mvc.perform(post("/api/projects").header("Authorization", "Bearer " + alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"가입 확인","roomType":"거실","dimensions":{"width":5,"depth":4,"height":2.4}}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(response).path("id").asString();

        mvc.perform(get("/api/projects/{id}", id).header("Authorization", "Bearer " + bob)).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects/{id}", id).header("Authorization", "Bearer " + alice)).andExpect(status().isOk());
    }

    private String signUp(String username, String password) throws Exception {
        String response = mvc.perform(signup(username, password)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.token", not(emptyOrNullString())))
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("token").asString();
    }

    private org.springframework.test.web.servlet.RequestBuilder signup(String username, String password) throws Exception {
        return post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("username", username, "password", password)));
    }

    private org.springframework.test.web.servlet.RequestBuilder login(String username, String password) throws Exception {
        return post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("username", username, "password", password)));
    }
}
