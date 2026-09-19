package com.kokoro.room.project;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

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

    /** Versioned shape contract for a future floor-plan converter and the 3D client. */
    public record FloorPlanConversionResult(
            String schemaVersion,
            String jobId,
            String unit,
            RoomBounds room,
            List<Wall> walls,
            List<Opening> openings
    ) {}

    public record RoomBounds(double width, double depth, double height) {}

    public record Wall(
            String id,
            Point start,
            Point end,
            double height,
            double thickness
    ) {}

    public record Opening(
            String id,
            String wallId,
            String type,
            double offset,
            double width,
            double height,
            double sillHeight
    ) {}

    public record Point(double x, double z) {}

    public record FurnitureItem(
            @NotBlank String id,
            @NotBlank String catalogId,
            @NotBlank String name,
            @NotBlank String category,
            @NotNull Double x,
            @NotNull Double z,
            @NotNull Integer rotation,
            @NotBlank String color
    ) {}

    public record RenovationProject(
            String id,
            @JsonIgnore String ownerId,
            String name,
            String roomType,
            Dimensions dimensions,
            FloorPlan floorPlan,
            List<FurnitureItem> furniture,
            Instant updatedAt
    ) {}

    public record CreateProjectRequest(
            @NotBlank String name,
            @NotBlank String roomType,
            @NotNull @Valid Dimensions dimensions
    ) {}

    public record SaveLayoutRequest(@NotNull List<@Valid FurnitureItem> furniture) {}

    public record ChatCommandRequest(@NotBlank String message) {}

    public record ChatCommandResponse(
            String reply,
            List<String> appliedActions,
            RenovationProject project
    ) {}
}
