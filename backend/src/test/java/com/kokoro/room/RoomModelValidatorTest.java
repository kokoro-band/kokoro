package com.kokoro.room;

import com.kokoro.room.project.InvalidRoomException;
import com.kokoro.room.project.ProjectModels.RoomModel;
import com.kokoro.room.project.RoomModelValidator;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.*;

class RoomModelValidatorTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final RoomModelValidator validator = new RoomModelValidator();

    private ObjectNode fixture() throws Exception {
        try (var source = getClass().getResourceAsStream("/contracts/room-v2.json")) {
            return (ObjectNode) mapper.readTree(source).path("room");
        }
    }

    @Test
    void acceptsAnImportedRoomWhoseSharedWallEndsOnAFractionalBoundary() throws Exception {
        var room = mapper.readTree("""
                {"version":2,"unit":"m","wallHeight":2.4,
                 "bounds":{"width":8.5,"depth":7.8},
                 "outline":[[0,0],[8.5,0],[8.5,7.8],[0,7.8]],
                 "walls":[{"id":"shared","a":[4.3,0],"b":[4.3,7.8],"thickness":0.12}],
                 "openings":[],"rooms":[],"spawn":[2.15,3.9]}
                """);
        assertDoesNotThrow(() -> validator.validate(mapper.treeToValue(room, RoomModel.class)));
    }

    @Test
    void stillRejectsWallEndsInAConcaveCutoutInsideTheBoundingBox() throws Exception {
        var room = fixture();
        room.set("walls", mapper.readTree("""
                [{"id":"outside","a":[5,3],"b":[3,1],"thickness":0.12}]
                """));
        room.set("openings", mapper.createArrayNode());
        var error = assertThrows(InvalidRoomException.class,
                () -> validator.validate(mapper.treeToValue(room, RoomModel.class)));
        assertTrue(error.violations().stream().anyMatch(violation -> violation.path().equals("walls[0]")));
    }

    @Test
    void acceptsEditorConcaveRoomAndMissingOptionalFields() throws Exception {
        var room = fixture();
        assertDoesNotThrow(() -> validator.validate(mapper.treeToValue(room, RoomModel.class)));
        room.remove("rooms");
        room.remove("spawn");
        assertDoesNotThrow(() -> validator.validate(mapper.treeToValue(room, RoomModel.class)));
    }

    @Test
    void rejectsInvalidGeometryAndReferencesWithoutUnboundedErrorLists() throws Exception {
        List<Consumer<ObjectNode>> cases = List.of(
                room -> room.put("version", 3),
                room -> room.put("unit", "cm"),
                room -> room.put("wallHeight", 0),
                room -> ((ObjectNode) room.path("bounds")).put("width", 201),
                room -> room.set("outline", mapper.readTree("[[0,0],[4,4],[0,4],[4,0]]")),
                room -> room.set("outline", mapper.readTree("[[0,0],[0,0],[2,2]]")),
                room -> room.set("outline", mapper.readTree("[[0,0],[1,0],[2,0]]")),
                room -> room.set("spawn", mapper.readTree("[5,3]")),
                room -> ((ObjectNode) room.path("walls").get(0)).put("thickness", -1),
                room -> ((ArrayNode) room.path("walls")).add(room.path("walls").get(0).deepCopy()),
                room -> ((ObjectNode) room.path("openings").get(0)).put("wallId", "missing"),
                room -> ((ObjectNode) room.path("openings").get(0)).put("to", 100),
                room -> ((ObjectNode) room.path("openings").get(0)).put("top", 3),
                room -> ((ObjectNode) room.path("openings").get(0)).put("from", -1),
                room -> ((ObjectNode) room.path("openings").get(0)).put("type", "arch"),
                room -> ((ArrayNode) room.path("openings")).add(room.path("openings").get(0).deepCopy()),
                room -> ((ObjectNode) room.path("rooms").get(0)).set("polygon", mapper.readTree("[[4,2],[6,2],[6,4],[4,4]]")),
                room -> room.set("source", mapper.readTree("{\"areaPyeong\":0,\"roomCount\":1,\"preset\":\"blocks-v1\"}")),
                room -> {
                    var points = mapper.createArrayNode();
                    for (int i = 0; i < 513; i++) points.add(mapper.createArrayNode().add(0).add(0));
                    room.set("outline", points);
                }
        );
        for (var change : cases) {
            var room = fixture();
            change.accept(room);
            var error = assertThrows(InvalidRoomException.class,
                    () -> validator.validate(mapper.treeToValue(room, RoomModel.class)), room.toString());
            assertFalse(error.violations().isEmpty());
            assertTrue(error.violations().size() <= 32);
        }
    }
}
