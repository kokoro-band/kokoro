package com.kokoro.room.project;

import java.util.List;

public final class InvalidRoomException extends RuntimeException {
    private final List<Violation> violations;

    public InvalidRoomException(List<Violation> violations) {
        super("공간 정보를 확인해 주세요.");
        this.violations = List.copyOf(violations);
    }

    public List<Violation> violations() { return violations; }

    public record Violation(String path, String reason) {}
}
