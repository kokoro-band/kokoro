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

import java.nio.file.Path;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
@Testcontainers
class SignupLimitTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @TempDir static Path storage;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("app.floor-plan-storage-root", () -> storage.toString());
        registry.add("app.security.demo.jwt-secret", () -> "signup-limit-signing-key-0123456789abcdef");
        registry.add("app.security.demo.accounts", () -> "kokoro-demo:" + new BCryptPasswordEncoder().encode("demo-pass-1"));
        registry.add("app.security.demo.max-users", () -> "2");
    }

    @Autowired MockMvc mvc;
    @MockitoBean com.kokoro.room.project.FloorPlanJobDispatcher dispatcher;

    @Test
    void signingUpStopsWhenTheAccountLimitIsReached() throws Exception {
        mvc.perform(signup("first-user")).andExpect(status().isCreated());
        mvc.perform(signup("second-user")).andExpect(status().isCreated());

        mvc.perform(signup("third-user")).andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.detail", containsString("가득")));
        // Existing accounts are not affected.
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"first-user\",\"password\":\"correct-horse\"}")).andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.RequestBuilder signup(String username) {
        return post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"correct-horse\"}");
    }
}
