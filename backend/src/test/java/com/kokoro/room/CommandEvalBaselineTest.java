package com.kokoro.room;

import com.kokoro.room.project.LayoutCommandInterpreter.Interpretation;
import com.kokoro.room.project.ProjectModels.LayoutActionType;
import com.kokoro.room.project.ProjectModels.LayoutCommand;
import com.kokoro.room.project.ProjectModels.RoomBounds;
import com.kokoro.room.project.RuleBasedLayoutCommandInterpreter;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the rule-based interpreter over docs/ai/korean-layout-command-eval.json and pins the result in
 * docs/ai/rule-baseline-results.json. Refresh the pinned file with -Dkokoro.eval.update=true.
 * Requires the full repository checkout, like the shared furniture catalog.
 */
class CommandEvalBaselineTest {
    private static final Path DOCS = Path.of("..", "docs", "ai");
    private static final Set<String> CATEGORIES = Set.of("추가", "이동", "회전", "삭제", "전체삭제", "다중대상", "모호", "처리불가", "악성");
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    @Test
    void datasetIsWellFormedAndSplitIsFixed() throws IOException {
        JsonNode items = dataset().path("items");
        assertThat(items).hasSize(100);
        assertThat(items.valueStream().map(item -> item.path("id").asString()).distinct()).hasSize(100);
        assertThat(items.valueStream().filter(item -> "dev".equals(item.path("split").asString()))).hasSize(70);
        assertThat(items.valueStream().filter(item -> "eval".equals(item.path("split").asString()))).hasSize(30);
        for (JsonNode item : items) {
            assertThat(CATEGORIES).contains(item.path("category").asString());
            assertThat(item.path("input").asString()).isNotBlank();
            // A row is either a rejection or has at least one expected intent.
            assertThat(item.path("expectedRejection").asBoolean() || !item.path("expectedIntents").isEmpty())
                    .as(item.path("id").asString()).isTrue();
        }
    }

    @Test
    void ruleBasedResultsMatchThePinnedBaseline() throws IOException {
        var interpreter = new RuleBasedLayoutCommandInterpreter();
        JsonNode context = dataset().path("context");
        var bounds = new RoomBounds(context.path("roomWidth").asDouble(), context.path("roomDepth").asDouble());

        Map<String, int[]> bySplit = new LinkedHashMap<>();   // {total, matched, wrongExecution, unconfirmedClear}
        Map<String, int[]> byCategory = new LinkedHashMap<>();
        List<Map<String, Object>> failures = new ArrayList<>();
        for (JsonNode item : dataset().path("items")) {
            Interpretation result = interpreter.interpret(item.path("input").asString(), bounds);
            boolean matched = matches(item, result);
            boolean executed = !result.commands().isEmpty() && !result.requiresConfirmation();
            boolean wrongExecution = item.path("expectedRejection").asBoolean() && executed;
            boolean unconfirmedClear = result.commands().stream().anyMatch(c -> c.type() == LayoutActionType.CLEAR)
                    && !result.requiresConfirmation();
            for (int[] counts : List.of(
                    bySplit.computeIfAbsent(item.path("split").asString(), k -> new int[4]),
                    byCategory.computeIfAbsent(item.path("category").asString(), k -> new int[4]))) {
                counts[0]++;
                if (matched) counts[1]++;
                if (wrongExecution) counts[2]++;
                if (unconfirmedClear) counts[3]++;
            }
            if (!matched) {
                Map<String, Object> failure = new LinkedHashMap<>();
                failure.put("id", item.path("id").asString());
                failure.put("split", item.path("split").asString());
                failure.put("input", item.path("input").asString());
                failure.put("expected", item.path("expectedRejection").asBoolean() ? "거절 또는 되묻기"
                        : intents(item.path("expectedIntents")) + (item.path("expectedRequiresConfirmation").asBoolean() ? " (확인 필요)" : ""));
                failure.put("actual", result.commands().isEmpty() ? "명령 없음"
                        : result.commands().stream().map(c -> c.type() + (c.catalogId() == null ? "" : ":" + c.catalogId())).toList()
                        + (result.requiresConfirmation() ? " (확인 필요)" : ""));
                failures.add(failure);
            }
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("interpreter", "RuleBasedLayoutCommandInterpreter");
        report.put("datasetVersion", dataset().path("version").asInt());
        report.put("notMeasured", List.of("처리 시간", "메모리", "JSON 형태 성공률(규칙 처리기는 구조화 결과를 직접 반환)"));
        report.put("bySplit", summarize(bySplit));
        report.put("byCategory", summarize(byCategory));
        report.put("failures", failures);
        String actual = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(report) + "\n";

        Path pinned = DOCS.resolve("rule-baseline-results.json");
        if (Boolean.getBoolean("kokoro.eval.update")) Files.writeString(pinned, actual, StandardCharsets.UTF_8);
        assertThat(Files.readString(pinned, StandardCharsets.UTF_8)).isEqualTo(actual);
    }

    private static boolean matches(JsonNode item, Interpretation result) {
        if (item.path("expectedRejection").asBoolean()) return result.commands().isEmpty() && !result.requiresConfirmation();
        JsonNode expected = item.path("expectedIntents");
        if (result.commands().size() != expected.size()
                || result.requiresConfirmation() != item.path("expectedRequiresConfirmation").asBoolean()) return false;
        for (int i = 0; i < expected.size(); i++) {
            LayoutCommand command = result.commands().get(i);
            JsonNode intent = expected.get(i);
            if (!command.type().name().equals(intent.path("type").asString())) return false;
            JsonNode target = intent.path("target");
            if (!target.isNull() && !target.isMissingNode()
                    && (command.catalogId() == null || !command.catalogId().startsWith(target.asString() + "-"))) return false;
        }
        return true;
    }

    private static String intents(JsonNode expected) {
        List<String> names = new ArrayList<>();
        for (JsonNode intent : expected) names.add(intent.path("type").asString()
                + (intent.path("target").isNull() ? "" : ":" + intent.path("target").asString()));
        return names.toString();
    }

    private static Map<String, Map<String, Object>> summarize(Map<String, int[]> counts) {
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        counts.forEach((name, c) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("total", c[0]);
            row.put("intentMatch", c[1]);
            row.put("intentMatchRate", Math.round(c[1] * 1000.0 / c[0]) / 10.0);
            row.put("wrongExecution", c[2]);
            row.put("unconfirmedClear", c[3]);
            result.put(name, row);
        });
        return result;
    }

    private static JsonNode dataset() throws IOException {
        return MAPPER.readTree(Files.readString(DOCS.resolve("korean-layout-command-eval.json"), StandardCharsets.UTF_8));
    }
}
