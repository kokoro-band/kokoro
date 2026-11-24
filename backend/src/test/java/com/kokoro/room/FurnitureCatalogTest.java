package com.kokoro.room;

import com.kokoro.room.project.FurnitureCatalog;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FurnitureCatalogTest {
    @Test
    void rejectsDuplicatesAndInvalidDimensions() throws Exception {
        var mapper = JsonMapper.builder().build();
        var root = mapper.readTree(source());
        var first = root.path("items").get(0);
        var duplicate = root.deepCopy();
        ((ArrayNode) duplicate.path("items")).add(first);
        assertThatThrownBy(() -> FurnitureCatalog.parse(duplicate.toString()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ID");
        for (String value : List.of("0", "-1", "null", "\"2\"")) {
            for (String field : List.of("width", "depth")) {
                var changed = root.deepCopy();
                ((ObjectNode) changed.path("items").get(0)).set(field, mapper.readTree(value));
                assertThatThrownBy(() -> FurnitureCatalog.parse(changed.toString()))
                        .isInstanceOf(IllegalArgumentException.class);
            }
        }
        for (String field : List.of("width", "depth")) {
            var overflow = root.deepCopy();
            ((ObjectNode) overflow.path("items").get(0)).put(field, Double.POSITIVE_INFINITY);
            assertThatThrownBy(() -> FurnitureCatalog.parse(
                    overflow.toString().replace("\"Infinity\"", "1e999")))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        for (String field : List.of("version", "unit", "currency", "priceKind")) {
            var changed = root.deepCopy();
            ((ObjectNode) changed).put(field, "unsupported");
            assertThatThrownBy(() -> FurnitureCatalog.parse(changed.toString()))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    private static String source() throws Exception {
        try (var input = FurnitureCatalogTest.class.getResourceAsStream("/contracts/furniture-catalog.json")) {
            if (input == null) throw new IllegalStateException("Missing packaged furniture catalog");
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
