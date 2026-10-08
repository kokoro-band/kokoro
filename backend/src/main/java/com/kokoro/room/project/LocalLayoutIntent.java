package com.kokoro.room.project;

import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

/**
 * Parses docs/contracts/local-layout-intent.schema.json by hand. The contract fixtures under
 * docs/contracts/fixtures/local-layout-intent.json are run against this class in LocalLayoutIntentTest.
 */
public final class LocalLayoutIntent {
    private LocalLayoutIntent() {}

    public enum Type { ADD, MOVE, ROTATE, REMOVE, CLEAR }

    public enum Relation { NEAR, FAR_FROM }

    /** Fields not used by a type stay null (count defaults to 1). */
    public record Intent(Type type, String catalogId, int count, String targetQuery, String anchorQuery,
                         Relation relation, Double rotation) {}

    private static final Pattern CATALOG_ID = Pattern.compile("^[a-z0-9][a-z0-9-]{0,99}$");
    private static final Set<String> COMMON = Set.of("type");

    public static List<Intent> parse(JsonNode root) {
        if (root == null || !root.isObject()) throw invalid("의도 형식이 올바르지 않습니다.");
        onlyKeys(root, Set.of("version", "intents"));
        if (!root.path("version").isIntegralNumber() || !root.path("version").canConvertToInt()
                || root.path("version").intValue() != 1) {
            throw invalid("지원하지 않는 의도 버전입니다.");
        }
        JsonNode items = root.path("intents");
        if (!items.isArray() || items.isEmpty() || items.size() > 10) throw invalid("의도는 1개 이상 10개 이하여야 합니다.");
        List<Intent> result = new ArrayList<>();
        for (JsonNode item : items) result.add(intent(item));
        return result;
    }

    private static Intent intent(JsonNode item) {
        if (!item.isObject()) throw invalid("의도 항목 형식이 올바르지 않습니다.");
        String type = item.path("type").isString() ? item.path("type").asString() : "";
        return switch (type) {
            case "ADD" -> {
                onlyKeys(item, Set.of("type", "catalogId", "count", "anchorQuery", "relation"));
                String catalogId = text(item, "catalogId");
                if (!CATALOG_ID.matcher(catalogId).matches()) throw invalid("가구 ID 형식이 올바르지 않습니다.");
                int count = 1;
                if (item.has("count")) {
                    JsonNode value = item.path("count");
                    if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() < 1 || value.intValue() > 5) {
                        throw invalid("추가 수량은 1개 이상 5개 이하여야 합니다.");
                    }
                    count = value.intValue();
                }
                String anchor = optionalQuery(item, "anchorQuery");
                yield new Intent(Type.ADD, catalogId, count, null, anchor, relation(item, anchor), null);
            }
            case "MOVE" -> {
                onlyKeys(item, Set.of("type", "targetQuery", "anchorQuery", "relation"));
                String anchor = optionalQuery(item, "anchorQuery");
                yield new Intent(Type.MOVE, null, 1, query(item, "targetQuery"), anchor, relation(item, anchor), null);
            }
            case "ROTATE" -> {
                onlyKeys(item, Set.of("type", "targetQuery", "rotation"));
                JsonNode value = item.path("rotation");
                if (!value.isNumber() || value.doubleValue() < -360 || value.doubleValue() > 360) {
                    throw invalid("회전은 -360도 이상 360도 이하여야 합니다.");
                }
                yield new Intent(Type.ROTATE, null, 1, query(item, "targetQuery"), null, null, value.doubleValue());
            }
            case "REMOVE" -> {
                onlyKeys(item, Set.of("type", "targetQuery"));
                yield new Intent(Type.REMOVE, null, 1, query(item, "targetQuery"), null, null, null);
            }
            case "CLEAR" -> {
                onlyKeys(item, COMMON);
                yield new Intent(Type.CLEAR, null, 1, null, null, null, null);
            }
            default -> throw invalid("지원하지 않는 의도입니다.");
        };
    }

    private static void onlyKeys(JsonNode node, Set<String> allowed) {
        for (String name : node.propertyNames()) {
            if (!allowed.contains(name)) throw invalid("정의되지 않은 필드가 있습니다.");
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isString()) throw invalid("필수 필드가 없습니다: " + field);
        return value.asString();
    }

    private static String query(JsonNode node, String field) {
        String value = text(node, field);
        if (value.length() > 100 || value.isBlank()) throw invalid("대상 표현은 공백이 아닌 100자 이하여야 합니다.");
        return value;
    }

    /** relation needs an anchor; an anchor without a relation means NEAR. */
    private static Relation relation(JsonNode node, String anchorQuery) {
        if (!node.has("relation")) return anchorQuery == null ? null : Relation.NEAR;
        if (anchorQuery == null) throw invalid("relation은 anchorQuery와 함께 써야 합니다.");
        JsonNode value = node.path("relation");
        if (value.isString() && value.asString().equals("NEAR")) return Relation.NEAR;
        if (value.isString() && value.asString().equals("FAR_FROM")) return Relation.FAR_FROM;
        throw invalid("지원하지 않는 relation 값입니다.");
    }

    private static String optionalQuery(JsonNode node, String field) {
        return node.has(field) ? query(node, field) : null;
    }

    private static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(BAD_REQUEST, message);
    }
}
