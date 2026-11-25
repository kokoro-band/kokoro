package com.kokoro.room;

import com.kokoro.room.project.FurnitureCatalog;
import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.FurnitureRegistry;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

final class TestFurnitureValidator {
    private TestFurnitureValidator() {}

    static FurniturePlacementValidator fromPackagedCatalog() {
        Map<String, JsonNode> items = new LinkedHashMap<>();
        try (var input = TestFurnitureValidator.class.getResourceAsStream("/contracts/furniture-catalog.json")) {
            if (input == null) throw new IllegalStateException("Missing packaged furniture catalog");
            String source = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            FurnitureCatalog.parse(source);
            for (JsonNode item : JsonMapper.builder().build().readTree(source).path("items")) {
                items.put(item.path("id").asString(), item);
            }
        } catch (IOException error) {
            throw new IllegalStateException(error);
        }
        FurnitureRegistry registry = mock(FurnitureRegistry.class);
        when(registry.require(anyString())).thenAnswer(invocation -> {
            String id = invocation.getArgument(0);
            JsonNode item = items.get(id);
            if (item == null) throw new ResponseStatusException(BAD_REQUEST, "지원하지 않는 가구입니다: " + id);
            return item;
        });
        return new FurniturePlacementValidator(registry);
    }
}
