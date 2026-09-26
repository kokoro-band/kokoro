package com.kokoro.room.project;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

public class InvalidPlacementException extends ResponseStatusException {
    private final String code;
    private final List<String> furnitureIds;
    private final String wallId;
    private final String openingId;

    public InvalidPlacementException(String code, String detail, List<String> furnitureIds,
                                     String wallId, String openingId) {
        super(HttpStatus.BAD_REQUEST, detail);
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
