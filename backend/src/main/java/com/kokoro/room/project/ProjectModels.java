package com.kokoro.room.project;

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
            Instant uploadedAt
    ) {}

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
