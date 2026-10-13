package com.kokoro.room.project;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import tools.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.time.Instant;
import java.util.List;

public final class ProjectModels {
    private ProjectModels() {}

    public enum ConversionStatus { EMPTY, PROCESSING, READY, FAILED }

    public record Dimensions(double width, double depth, double height) {}

    public record FloorPlan(
            String fileName,
            long size,
            ConversionStatus status,
            int progress,
            Instant uploadedAt,
            String jobId,
            @JsonIgnore
            String objectKey,
            String errorCode,
            String errorMessage,
            boolean retryable
    ) {}

    public record FloorPlanJob(
            String jobId,
            String projectId,
            @JsonIgnore
            String objectKey,
            ConversionStatus status,
            int progress,
            String errorCode,
            String errorMessage,
            boolean retryable,
            Instant createdAt,
            Instant startedAt,
            Instant completedAt
    ) {}

    /**
     * Room structure built by the user. Lengths are meters and floor coordinates start
     * at the top-left corner of {@link RoomBounds}. See docs/contracts/room-model.md.
     */
    public record RoomModel(
            @NotNull Integer version,
            @NotBlank String unit,
            @NotNull Double wallHeight,
            @NotNull RoomBounds bounds,
            @NotNull List<Point> outline,
            @NotNull List<@Valid Wall> walls,
            @NotNull List<@Valid Opening> openings,
            List<RoomLabel> rooms,
            Point spawn,
            RoomSource source
    ) {}

    public record RoomBounds(double width, double depth) {}

    public record Wall(
            @NotBlank String id,
            @NotNull Point a,
            @NotNull Point b,
            @NotNull Double thickness
    ) {}

    public record Opening(
            @NotBlank String id,
            @NotBlank String wallId,
            @NotBlank String type,
            @NotNull Double from,
            @NotNull Double to,
            @NotNull Double bottom,
            @NotNull Double top
    ) {}

    public record RoomLabel(String name, List<Point> polygon) {}

    public record RoomSource(double areaPyeong, int roomCount, String preset) {}

    public record Point(double x, double z) {
        @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
        public static Point fromJson(JsonNode value) {
            if (!value.isArray() || value.size() != 2
                    || !value.get(0).isNumber() || !value.get(1).isNumber()) {
                throw new IllegalArgumentException("좌표는 숫자 두 개의 [x, z] 배열이어야 합니다.");
            }
            double x = value.get(0).doubleValue();
            double z = value.get(1).doubleValue();
            if (!Double.isFinite(x) || !Double.isFinite(z)) {
                throw new IllegalArgumentException("좌표는 유한한 숫자여야 합니다.");
            }
            return new Point(x, z);
        }

        @JsonValue
        public double[] coordinates() {
            return new double[] { x, z };
        }
    }

    public record FurnitureItem(
            @NotBlank String id,
            @NotBlank String catalogId,
            @NotBlank String name,
            @NotBlank String category,
            @NotNull Double x,
            @NotNull Double z,
            @NotNull Double rotation,
            @NotBlank String color
    ) {}

    public record RenovationProject(
            String id,
            @JsonIgnore String ownerId,
            String name,
            String roomType,
            Dimensions dimensions,
            RoomModel room,
            FloorPlan floorPlan,
            List<FurnitureItem> furniture,
            Instant updatedAt,
            long revision
    ) {}

    public record SaveRoomRequest(@NotNull @Valid RoomModel room, @PositiveOrZero Long expectedRevision) {}

    public record CreateProjectRequest(
            @NotBlank String name,
            @NotBlank String roomType,
            @NotNull @Valid Dimensions dimensions
    ) {}

    public record SaveLayoutRequest(@NotNull List<@Valid FurnitureItem> furniture, @PositiveOrZero Long expectedRevision) {}

    public record ChatCommandRequest(@NotBlank String message, String furnitureId, @PositiveOrZero Long expectedRevision) {}

    public record ConfirmCommandRequest(@NotBlank String proposalId) {}

    /** {@code selections} maps a 0-based intent index to the furnitureId the user picked among candidates. */
    public record LayoutIntentRequest(@NotNull tools.jackson.databind.JsonNode intent,
                                      java.util.Map<String, String> selections,
                                      @PositiveOrZero Long expectedRevision) {}

    public enum LayoutActionType { ADD, MOVE, ROTATE, REMOVE, CLEAR }

    public record LayoutCommand(
            LayoutActionType type,
            String catalogId,
            String furnitureId,
            Double x,
            Double z,
            Integer rotation
    ) {}

    public record LayoutCandidate(String furnitureId, String name) {}

    /** A destructive command (CLEAR) staged for a one-time confirm within {@code expiresAt}. */
    public record LayoutProposal(
            String proposalId,
            String projectId,
            String ownerId,
            Instant baseUpdatedAt,
            Long baseRevision,
            List<LayoutCommand> commands,
            Instant createdAt,
            Instant expiresAt,
            Instant consumedAt
    ) {}

    public record ChatCommandResponse(
            String reply,
            List<String> appliedActions,
            List<LayoutCommand> commands,
            boolean requiresConfirmation,
            RenovationProject project,
            String proposalId,
            Instant expiresAt,
            List<LayoutCommand> proposedCommands,
            List<LayoutCandidate> candidates
    ) {}
}
