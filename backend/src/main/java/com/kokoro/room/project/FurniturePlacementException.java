package com.kokoro.room.project;

import java.util.List;

/** Structured 400 for geometry conflicts so callers don't need to parse message text. */
public final class FurniturePlacementException extends RuntimeException {
    private final String code;
    private final List<String> furnitureIds;
    private final String wallId;
    private final String openingId;

    public FurniturePlacementException(String code, String message, List<String> furnitureIds,
                                        String wallId, String openingId) {
        super(message);
        this.code = code;
        this.furnitureIds = List.copyOf(furnitureIds);
        this.wallId = wallId;
        this.openingId = openingId;
    }

    public String code() { return code; }
    public List<String> furnitureIds() { return furnitureIds; }
    public String wallId() { return wallId; }
    public String openingId() { return openingId; }
}
