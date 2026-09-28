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

    boolean tryStartFloorPlan(String projectId, String ownerId, FloorPlan floorPlan, Instant updatedAt);

    boolean updateFloorPlanStatus(String projectId, String jobId, ConversionStatus status, int progress,
                                  String errorCode, String errorMessage, boolean retryable);

    int failProcessingFloorPlans(String errorCode, String errorMessage);

    void insert(RenovationProject project);

    void replace(RenovationProject project);

    void delete(String id);
}
