package com.kokoro.room.project;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** The packaged contract is the only source of placement dimensions. */
public final class FurnitureCatalog {
    private FurnitureCatalog() {}

    public static Map<String, Size> load() {
        try (var input = FurnitureCatalog.class.getResourceAsStream("/contracts/furniture-catalog.json")) {
            if (input == null) throw invalid("공통 규격 파일이 없습니다.");
            return parse(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException error) {
            throw new IllegalStateException("가구 규격을 읽지 못했습니다.", error);
        }
    }

    public static Map<String, Size> parse(String source) {
        JsonNode root = JsonMapper.builder().build().readTree(source);
        if (root == null || !root.isObject() || !root.path("version").isIntegralNumber()
                || root.path("version").intValue() != 1 || !"m".equals(root.path("unit").asString())
                || !"example".equals(root.path("priceKind").asString())
                || !"KRW".equals(root.path("currency").asString())
                || !root.path("items").isArray() || root.path("items").isEmpty()) {
            throw invalid("지원하지 않는 규격 형식입니다.");
        }
        Map<String, Size> result = new LinkedHashMap<>();
        for (JsonNode item : root.path("items")) {
            String id = text(item, "id");
            text(item, "name");
            text(item, "description");
            if (!id.matches("[a-z0-9]+(?:-[a-z0-9]+)*") || result.containsKey(id)) {
                throw invalid("중복되거나 잘못된 가구 ID: " + id);
            }
            if (!Set.of("소파", "테이블", "의자", "장식").contains(text(item, "category"))
                    || !text(item, "color").matches("#[0-9a-fA-F]{6}")
                    || !item.path("price").isIntegralNumber() || !item.path("price").canConvertToLong()
                    || item.path("price").longValue() < 0 || item.path("price").longValue() > 9007199254740991L
                    || (item.has("modelUrl") && !text(item, "modelUrl").matches("/models/[a-z0-9-]+\\.glb"))) {
                throw invalid("표시 정보가 올바르지 않습니다: " + id);
            }
            result.put(id, new Size(positive(item, "width"), positive(item, "depth")));
        }
        return Map.copyOf(result);
    }

    private static String text(JsonNode item, String field) {
        JsonNode value = item.path(field);
        if (!value.isString() || value.asString().isBlank()) throw invalid("필수 문자열: " + field);
        return value.asString();
    }

    private static double positive(JsonNode item, String field) {
        JsonNode value = item.path(field);
        if (!value.isNumber() || !Double.isFinite(value.doubleValue()) || value.doubleValue() <= 0) {
            throw invalid("양수 치수가 필요합니다: " + field);
        }
        return value.doubleValue();
    }

    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException("가구 규격: " + message);
    }

    public record Size(double width, double depth) {}
}
