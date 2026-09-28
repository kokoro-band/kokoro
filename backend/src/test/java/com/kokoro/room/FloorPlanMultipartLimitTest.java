package com.kokoro.room;

import com.kokoro.room.project.FloorPlanJobDispatcher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class FloorPlanMultipartLimitTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @TempDir static Path storage;
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @MockitoBean FloorPlanJobDispatcher dispatcher;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("app.floor-plan-storage-root", () -> storage.toString());
    }

    @Test
    void acceptsExactlyFifteenMiBAndRejectsLargerPartWithSafeProblemDetail() throws Exception {
        String id = createProject();
        var accepted = upload(id, 15 * 1024 * 1024);
        assertThat(accepted.statusCode()).isEqualTo(200);

        String rejectedId = createProject();
        var rejected = upload(rejectedId, 15 * 1024 * 1024 + 1);
        assertThat(rejected.statusCode()).isEqualTo(413);
        assertThat(mapper.readTree(rejected.body()).path("detail").asString()).contains("15MiB");
        assertThat(rejected.body()).doesNotContain(storage.toString(), "Exception", "stackTrace");
        assertThat(Files.exists(storage.resolve(rejectedId))).isFalse();
    }

    private String createProject() throws Exception {
        var response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(uri("/api/projects"))
                        .timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString("""
                                {"name":"multipart 경계","roomType":"거실","dimensions":{"width":5,"depth":4,"height":2.4}}
                                """)).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(201);
        return mapper.readTree(response.body()).path("id").asString();
    }

    private HttpResponse<String> upload(String id, int size) throws Exception {
        var body = new ByteArrayOutputStream();
        body.write("--kokoro-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"plan.pdf\"\r\nContent-Type: application/pdf\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
        byte[] payload = new byte[size];
        System.arraycopy("%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII), 0, payload, 0, 9);
        body.write(payload);
        body.write("\r\n--kokoro-boundary--\r\n".getBytes(StandardCharsets.US_ASCII));
        return HttpClient.newHttpClient().send(HttpRequest.newBuilder(uri("/api/projects/" + id + "/floor-plan"))
                        .timeout(Duration.ofSeconds(30))
                        .header("Content-Type", "multipart/form-data; boundary=kokoro-boundary")
                        .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
}
