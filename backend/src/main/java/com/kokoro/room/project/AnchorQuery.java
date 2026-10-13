package com.kokoro.room.project;

import com.kokoro.room.project.RelativePlacementPlanner.AnchorKind;

/** Reads what the user meant by an anchor expression such as "창가" or "문 옆". Only windows and doors exist. */
public final class AnchorQuery {
    private AnchorQuery() {}

    public static AnchorKind kind(String query) {
        String compact = query.replace(" ", "");
        // Check the window first: "창문" contains the door character too.
        if (compact.contains("창")) return AnchorKind.WINDOW;
        if (compact.contains("문")) return AnchorKind.DOOR;
        throw new LayoutIntentException("NO_ANCHOR", "창문이나 문을 기준으로 한 위치만 지원합니다: " + query);
    }
}
