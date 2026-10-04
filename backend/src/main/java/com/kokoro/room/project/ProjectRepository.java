package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.FloorPlan;
import com.kokoro.room.project.ProjectModels.RenovationProject;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ProjectRepository {
    List<RenovationProject> findAll();

    Optional<RenovationProject> findById(String id);

    /** Call inside the write transaction, before reading or changing dependent rows. */
    Optional<RenovationProject> lockById(String id);

    /** Ordered, locked recovery snapshot. Only these projects and their current jobs may be recovered. */
    List<RenovationProject> lockProcessing();

    boolean tryStartFloorPlan(String projectId, String ownerId, FloorPlan floorPlan, Instant updatedAt);

    boolean updateFloorPlanStatus(String projectId, String jobId, ConversionStatus status, int progress,
                                  String errorCode, String errorMessage, boolean retryable);

    void insert(RenovationProject project);

    void replace(RenovationProject project);

    void delete(String id);
}
