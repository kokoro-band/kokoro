package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.RenovationProject;
import com.kokoro.room.project.ProjectModels.ConversionStatus;

import java.util.List;
import java.util.Optional;

public interface ProjectRepository {
    List<RenovationProject> findAll();

    Optional<RenovationProject> findById(String id);

    /** Must be called inside the transaction that performs the corresponding write. */
    Optional<RenovationProject> lockById(String id);

    boolean updateFloorPlanStatus(String projectId, String jobId, ConversionStatus status,
                                 int progress, String errorCode, String errorMessage, boolean retryable);

    void insert(RenovationProject project);

    void replace(RenovationProject project);

    void delete(String id);
}
