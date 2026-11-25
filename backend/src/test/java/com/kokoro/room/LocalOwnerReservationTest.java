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
class LocalOwnerReservationTest {
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
        registry.add("app.security.demo.jwt-secret", () -> "reserved-owner-test-key-0123456789abcdef");
        registry.add("app.security.demo.accounts", () -> "kokoro-demo:" + ENCODER.encode("demo-pass-1"));
        // Same as setting LOCAL_USER_ID on the server.
        registry.add("app.security.local-user", () -> "studio-owner");
    }

    @Autowired MockMvc mvc;
    @MockitoBean com.kokoro.room.project.FloorPlanJobDispatcher dispatcher;

    @Test
    void aCustomLocalOwnerIdAndTheLegacyOwnerCannotBeTakenBySignUp() throws Exception {
        mvc.perform(signup("studio-owner")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail", containsString("이미")));
        mvc.perform(signup("Studio-Owner")).andExpect(status().isConflict());
        // Migration V3 gave pre-ownership projects to local-user, so that name stays reserved too.
        mvc.perform(signup("local-user")).andExpect(status().isConflict());
    }

    private org.springframework.test.web.servlet.RequestBuilder signup(String username) {
        return post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"correct-horse\"}");
    }
}
