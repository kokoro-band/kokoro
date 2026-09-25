package com.kokoro.room;

import com.kokoro.room.project.FurnitureCatalog;
import com.kokoro.room.project.FurnitureCatalog.Size;
import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FurnitureCatalogTest {
    @Test
    void packagedCatalogEqualsSharedSourceAndPreservesEveryFootprint() throws Exception {
        var catalog = FurnitureCatalog.load();
        assertThat(catalog).isEqualTo(FurnitureCatalog.parse(source()));
        assertThat(catalog).containsExactlyInAnyOrderEntriesOf(Map.of(
                "sofa-cloud", new Size(2.2, 0.92), "sofa-moss", new Size(2.1, 0.95),
                "table-oak", new Size(1.25, 0.7), "table-white", new Size(1, 1),
                "chair-shell", new Size(0.65, 0.65), "chair-sand", new Size(0.65, 0.65),
                "plant-olive", new Size(0.55, 0.55), "lamp-arc", new Size(0.5, 0.5)));
        var validator = new FurniturePlacementValidator();
        catalog.forEach((id, size) -> {
            var boundary = new FurnitureItem(id, id, id, "의자", size.width() / 2, size.depth() / 2, 0, "#000000");
            validator.validate(new Dimensions(10, 10, 2.4), null, List.of(boundary));
            var outside = new FurnitureItem(id, id, id, "의자", size.width() / 2 - 0.01, size.depth() / 2, 0, "#000000");
            assertThatThrownBy(() -> validator.validate(new Dimensions(10, 10, 2.4), null, List.of(outside)))
                    .hasMessageContaining("방 경계");
        });
        assertThatThrownBy(() -> validator.validate(new Dimensions(10, 10, 2.4), null,
                List.of(new FurnitureItem("unknown", "unknown", "unknown", "의자", 2.0, 2.0, 0, "#000000"))))
                .hasMessageContaining("지원하지 않는 가구");
    }

    @Test
    void rejectsDuplicatesAndInvalidDimensions() throws Exception {
        var mapper = JsonMapper.builder().build();
        var root = mapper.readTree(source());
        var first = root.path("items").get(0);
        var duplicate = root.deepCopy();
        ((tools.jackson.databind.node.ArrayNode) duplicate.path("items")).add(first);
        assertThatThrownBy(() -> FurnitureCatalog.parse(duplicate.toString())).hasMessageContaining("ID");
        for (String value : List.of("0", "-1", "null", "\"2\"", "1e999")) {
            for (String field : List.of("width", "depth")) {
                var changed = root.deepCopy();
                ((tools.jackson.databind.node.ObjectNode) changed.path("items").get(0)).set(field, mapper.readTree(value));
                assertThatThrownBy(() -> FurnitureCatalog.parse(changed.toString())).isInstanceOf(RuntimeException.class);
            }
        }
        for (String field : List.of("version", "unit", "currency", "priceKind")) {
            var changed = root.deepCopy();
            ((tools.jackson.databind.node.ObjectNode) changed).put(field, "unsupported");
            assertThatThrownBy(() -> FurnitureCatalog.parse(changed.toString())).isInstanceOf(IllegalArgumentException.class);
        }
    }

    private static String source() throws Exception {
        return Files.readString(Path.of("../docs/contracts/furniture-catalog.json"));
    }
}
