package com.kokoro.room.project;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Compatibility applies only to persisted rooms, never to incoming API requests. */
final class StoredRoomJson {
    private StoredRoomJson() {}

    static ProjectModels.RoomModel read(ObjectMapper mapper, String json) {
        JsonNode room = mapper.readTree(json);
        convertPoints(room.path("outline"), mapper);
        for (JsonNode wall : room.path("walls")) {
            convertField(wall, "a", mapper);
            convertField(wall, "b", mapper);
        }
        for (JsonNode label : room.path("rooms")) convertPoints(label.path("polygon"), mapper);
        convertField(room, "spawn", mapper);
        return mapper.treeToValue(room, ProjectModels.RoomModel.class);
    }

    private static void convertPoints(JsonNode value, ObjectMapper mapper) {
        if (value instanceof ArrayNode points) {
            for (int index = 0; index < points.size(); index++) {
                points.set(index, convert(points.get(index), mapper));
            }
        }
    }

    private static void convertField(JsonNode parent, String key, ObjectMapper mapper) {
        if (parent instanceof ObjectNode object && object.has(key)) {
            object.set(key, convert(object.get(key), mapper));
        }
    }

    private static JsonNode convert(JsonNode value, ObjectMapper mapper) {
        if (value.isObject() && value.path("x").isNumber() && value.path("z").isNumber()) {
            return mapper.createArrayNode().add(value.get("x")).add(value.get("z"));
        }
        return value;
    }
}
