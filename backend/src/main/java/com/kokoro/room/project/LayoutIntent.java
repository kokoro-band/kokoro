package com.kokoro.room.project;

import tools.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

/** Strict boundary for untrusted model output. No code, URLs or model-generated coordinates are accepted. */
public record LayoutIntent(List<Command> commands) {
    public enum Action { ADD, MOVE, ROTATE, REMOVE, CLEAR }
    public enum Placement { AUTO, CENTER, LEFT, RIGHT, FRONT, BACK, NEAR_WINDOW, NEAR_DOOR,
        OFFSET_LEFT, OFFSET_RIGHT, OFFSET_FRONT, OFFSET_BACK }
    public record Command(Action action, String catalogId, String targetQuery, String anchorQuery,
                          Placement placement, double distanceM, int rotation, int count) {}

    public static LayoutIntent parse(JsonNode root) {
        keys(root, "reply", "commands");
        if (!root.path("reply").isString() || root.path("reply").asString().length() > 500
                || !root.path("commands").isArray() || root.path("commands").isEmpty()
                || root.path("commands").size() > 8) throw invalid();
        var commands = new ArrayList<Command>();
        int additions = 0;
        for (var node : root.path("commands")) {
            keys(node, "action", "catalogId", "targetQuery", "anchorQuery", "placement", "distanceM", "rotation", "count");
            if (!node.path("action").isString() || !node.path("placement").isString()) throw invalid();
            Action action;
            Placement placement;
            try {
                action = Action.valueOf(node.path("action").asString());
                placement = Placement.valueOf(node.path("placement").asString());
            } catch (IllegalArgumentException error) { throw invalid(); }
            String catalog = text(node.get("catalogId"));
            String target = text(node.get("targetQuery"));
            String anchor = text(node.get("anchorQuery"));
            double distance = node.path("distanceM").doubleValue();
            if (!node.path("distanceM").isNumber() || !Double.isFinite(distance) || distance < 0 || distance > 5
                    || !node.path("rotation").isIntegralNumber() || !node.path("count").isIntegralNumber()
                    || node.path("rotation").doubleValue() < -360 || node.path("rotation").doubleValue() > 360
                    || node.path("count").doubleValue() < 1 || node.path("count").doubleValue() > 5) throw invalid();
            int count = node.path("count").intValue();
            if (action == Action.ADD) {
                if (catalog == null || catalog.isBlank() || placement.name().startsWith("OFFSET_")) throw invalid();
                additions += count;
            } else if (action != Action.CLEAR && (target == null || target.isBlank() || count != 1)) throw invalid();
            commands.add(new Command(action, catalog, target, anchor, placement, distance, node.path("rotation").intValue(), count));
        }
        if (additions > 12 || (commands.size() != 1 && commands.stream().anyMatch(c -> c.action() == Action.CLEAR))) throw invalid();
        return new LayoutIntent(List.copyOf(commands));
    }

    private static String text(JsonNode node) {
        if (node.isNull()) return null;
        if (!node.isString() || node.asString().length() > 100) throw invalid();
        return node.asString();
    }
    private static void keys(JsonNode node, String... keys) {
        if (node == null || !node.isObject() || node.size() != keys.length) throw invalid();
        for (String key : keys) if (!node.has(key)) throw invalid();
    }
    private static ResponseStatusException invalid() {
        return new ResponseStatusException(BAD_REQUEST, "로컬 모델의 명령 형식이 올바르지 않습니다. 배치를 변경하지 않았습니다.");
    }
}
