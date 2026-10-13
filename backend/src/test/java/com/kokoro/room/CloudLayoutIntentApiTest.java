package com.kokoro.room;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import com.kokoro.room.project.ProjectService;
import com.kokoro.room.project.FurnitureRegistry;
import com.kokoro.room.security.SecurityConfig;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest
@ComponentScan(basePackages = "com.kokoro.room.ai")
@Import(SecurityConfig.class)
@EnableWebSecurity
@AutoConfigureMockMvc
class CloudLayoutIntentApiTest {
    @MockitoBean ProjectService projects;
    @MockitoBean FurnitureRegistry furnitureRegistry;
    static final HttpServer upstream = stub();
    static final java.util.concurrent.ExecutorService executor = Executors.newCachedThreadPool();
    static final AtomicInteger calls = new AtomicInteger();
    static volatile String intent;
    static volatile int upstreamStatus;
    static volatile long delay;
    static volatile String captured;
    static volatile String path;
    static volatile String key;
    static volatile String finishReason;
    static volatile boolean largeBody;
    static volatile boolean delayedBody;
    static final String REQUEST = """
            {"message":"소파 옆에 화분 하나 놔줘","furniture":[{"catalogId":"sofa-cloud","name":"클라우드 소파"}]}
            """;
    static final String ADD = """
            {"action":"ADD","catalogId":"plant-olive","placement":"NEAR_TARGET","rotation":null,"anchorCatalogId":"sofa-cloud"}
            """;

    static HttpServer stub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                calls.incrementAndGet();
                captured = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                path = exchange.getRequestURI().toString();
                key = exchange.getRequestHeaders().getFirst("x-goog-api-key");
                try {
                    Thread.sleep(delay);
                    String body = upstreamStatus == 200
                            ? JsonMapper.builder().build().writeValueAsString(Map.of("candidates", new Object[] {
                                Map.of("finishReason", finishReason, "content", Map.of("parts", new Object[] {Map.of("text", intent)}))
                            }))
                            : "{\"error\":{\"message\":\"private-upstream-detail\"}}";
                    if (largeBody) body = " ".repeat(70_000) + body;
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(upstreamStatus, bytes.length);
                    if (delayedBody) {
                        exchange.getResponseBody().write(bytes, 0, 1);
                        exchange.getResponseBody().flush();
                        Thread.sleep(1000);
                        exchange.getResponseBody().write(bytes, 1, bytes.length - 1);
                    } else
                    exchange.getResponseBody().write(bytes);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                } catch (IOException disconnected) {
                    // A timeout deliberately closes the connection before the response.
                } finally {
                    exchange.close();
                }
            });
            return server;
        } catch (IOException error) {
            throw new ExceptionInInitializerError(error);
        }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        upstream.setExecutor(executor);
        upstream.start();
        registry.add("app.ai.api-key", () -> "test-key-only");
        registry.add("app.ai.base-url", () -> "http://127.0.0.1:" + upstream.getAddress().getPort());
        registry.add("app.ai.timeout-ms", () -> 300);
    }

    @AfterAll static void stop() { upstream.stop(0); executor.shutdownNow(); }
    @BeforeEach void reset() {
        intent = ADD;
        upstreamStatus = 200;
        delay = 0;
        calls.set(0);
        captured = null;
        finishReason = "STOP";
        largeBody = false;
        delayedBody = false;
    }
    @Autowired MockMvc mvc;

    @Test void convertsWithSchemaAndCatalogWithoutWritingProject() throws Exception {
        mvc.perform(post("/api/ai/layout-intent").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.action").value("ADD"))
                .andExpect(jsonPath("$.catalogId").value("plant-olive"))
                .andExpect(jsonPath("$.anchorCatalogId").value("sofa-cloud"))
                .andExpect(jsonPath("$.x").doesNotExist());
        assertEquals(1, calls.get());
        assertEquals("/v1beta/models/gemini-3.1-flash-lite:generateContent", path);
        assertEquals("test-key-only", key);
        assertTrue(captured.contains("responseJsonSchema"));
        assertTrue(captured.contains("소파 옆에 화분"));
        assertTrue(captured.contains("plant-olive"));
        assertFalse(captured.contains("test-key-only"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "not-json",
            "{\"action\":\"ADD\",\"catalogId\":\"invented\",\"placement\":\"CENTER\",\"rotation\":null,\"anchorCatalogId\":null}",
            "{\"action\":\"CLEAR\",\"catalogId\":\"sofa-cloud\",\"placement\":null,\"rotation\":null,\"anchorCatalogId\":null}",
            "{\"action\":\"ADD\",\"catalogId\":\"plant-olive\",\"placement\":\"NEAR_TARGET\",\"rotation\":null,\"anchorCatalogId\":\"chair-shell\"}",
            "{\"action\":\"ROTATE\",\"catalogId\":\"sofa-cloud\",\"placement\":\"CENTER\",\"rotation\":90,\"anchorCatalogId\":null}",
            "{\"action\":\"ADD\",\"catalogId\":\"plant-olive\",\"placement\":\"CENTER\",\"rotation\":null,\"anchorCatalogId\":null,\"x\":1}"
    })
    void refusesInvalidProviderIntent(String value) throws Exception {
        intent = value;
        mvc.perform(post("/api/ai/layout-intent").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isBadGateway());
        assertEquals(1, calls.get());
    }

    @Test void quotaIsReportedWithoutRetriesOrProviderDetails() throws Exception {
        upstreamStatus = 429;
        String body = mvc.perform(post("/api/ai/layout-intent").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isTooManyRequests()).andReturn().getResponse().getContentAsString();
        assertEquals(1, calls.get());
        assertFalse(body.contains("private-upstream-detail"));
        assertFalse(body.contains("test-key-only"));
    }

    @Test void timesOutWithoutRetry() throws Exception {
        delay = 1000;
        mvc.perform(post("/api/ai/layout-intent").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isGatewayTimeout());
        assertEquals(1, calls.get());
    }

    @Test void rejectsValidJsonFromAnIncompleteGeneration() throws Exception {
        finishReason = "MAX_TOKENS";
        mvc.perform(post("/api/ai/layout-intent").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isBadGateway());
    }

    @Test void boundsResponseSize() throws Exception {
        largeBody = true;
        mvc.perform(post("/api/ai/layout-intent").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isBadGateway());
    }

    @Test void timeoutIncludesBodyReceiving() throws Exception {
        delayedBody = true;
        mvc.perform(post("/api/ai/layout-intent").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
                .andExpect(status().isGatewayTimeout());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"message\":\" \",\"furniture\":[]}",
            "{\"message\":\"화분 놔줘\",\"furniture\":[{\"catalogId\":\"invented\",\"name\":\"가구\"}]}",
            "{\"message\":\"화분 놔줘\",\"furniture\":[],\"token\":\"must-not-forward\"}",
            "{\"message\":\"화분 놔줘\",\"furniture\":[{\"catalogId\":\"sofa-cloud\",\"name\":\"소파\",\"image\":\"must-not-forward\"}]}"
    })
    void refusesInvalidContextBeforeCallingProvider(String body) throws Exception {
        mvc.perform(post("/api/ai/layout-intent").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        assertEquals(0, calls.get());
    }
}
