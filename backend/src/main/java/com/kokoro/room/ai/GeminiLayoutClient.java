package com.kokoro.room.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.Flow;

import static org.springframework.http.HttpStatus.*;

@Component
public class GeminiLayoutClient {
    private final String apiKey;
    private final URI endpoint;
    private final int timeoutMs;
    private final HttpClient client;
    private final Semaphore capacity = new Semaphore(2);

    public GeminiLayoutClient(
            @Value("${app.ai.api-key:}") String apiKey,
            @Value("${app.ai.base-url:https://generativelanguage.googleapis.com}") String baseUrl,
            @Value("${app.ai.model:gemini-3.1-flash-lite}") String model,
            @Value("${app.ai.timeout-ms:8000}") int timeoutMs,
            Environment environment) {
        this.apiKey = apiKey;
        this.timeoutMs = Math.max(100, Math.min(timeoutMs, 8000));
        URI base = URI.create(baseUrl);
        boolean production = "https".equals(base.getScheme()) && "generativelanguage.googleapis.com".equals(base.getHost())
                && (base.getPort() == -1 || base.getPort() == 443);
        boolean localStub = environment.acceptsProfiles(Profiles.of("local")) && "http".equals(base.getScheme())
                && "127.0.0.1".equals(base.getHost());
        if ((!production && !localStub) || base.getRawUserInfo() != null || base.getRawQuery() != null
                || base.getRawFragment() != null || !List.of("", "/").contains(base.getPath())
                || !model.matches("[a-zA-Z0-9._-]{1,100}")) {
            throw new IllegalArgumentException("AI 제공자 주소와 모델 설정을 확인해 주세요.");
        }
        endpoint = base.resolve("/v1beta/models/" + model + ":generateContent");
        client = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(this.timeoutMs))
                .followRedirects(HttpClient.Redirect.NEVER).build();
    }

    public String generate(String body) {
        if (apiKey.isBlank()) throw new ResponseStatusException(SERVICE_UNAVAILABLE,
                "외부 AI가 설정되지 않았어요. 서버의 API 키 설정을 확인해 주세요.");
        if (!capacity.tryAcquire()) throw new ResponseStatusException(TOO_MANY_REQUESTS,
                "외부 AI가 다른 요청을 처리하고 있어요. 잠시 후 다시 요청해 주세요.");
        CompletableFuture<HttpResponse<byte[]>> pending = null;
        try {
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofMillis(timeoutMs))
                    .header("Content-Type", "application/json").header("x-goog-api-key", apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
            pending = client.sendAsync(request, ignored -> new BoundedBody());
            HttpResponse<byte[]> response = pending.get(timeoutMs, TimeUnit.MILLISECONDS);
            if (response.statusCode() == 429) throw new ResponseStatusException(TOO_MANY_REQUESTS,
                    "외부 AI의 호출 한도에 도달했어요. 잠시 후 다시 요청해 주세요.");
            if (response.statusCode() != 200) throw unavailable();
            return new String(response.body(), StandardCharsets.UTF_8);
        } catch (TimeoutException timeout) {
            throw new ResponseStatusException(GATEWAY_TIMEOUT, "외부 AI 응답이 늦어 중단했어요. 배치는 유지했어요.");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (ExecutionException error) {
            if (error.getCause() instanceof java.net.http.HttpTimeoutException)
                throw new ResponseStatusException(GATEWAY_TIMEOUT, "외부 AI 응답이 늦어 중단했어요. 배치는 유지했어요.");
            throw unavailable();
        } finally {
            if (pending != null && !pending.isDone()) pending.cancel(true);
            capacity.release();
        }
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(BAD_GATEWAY, "외부 AI 응답을 받지 못했어요. 배치는 유지했어요.");
    }

    /** Cancel before allocating a large body. get(timeout) also covers body delivery. */
    private static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private static final int LIMIT = 64 * 1024;
        private final CompletableFuture<byte[]> body = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        public CompletionStage<byte[]> getBody() { return body; }
        public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            subscription.request(1);
        }
        public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                if (buffer.remaining() > LIMIT - bytes.size()) {
                    subscription.cancel();
                    body.completeExceptionally(new IllegalArgumentException("AI response too large"));
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        public void onError(Throwable error) { body.completeExceptionally(error); }
        public void onComplete() { body.complete(bytes.toByteArray()); }
    }
}
