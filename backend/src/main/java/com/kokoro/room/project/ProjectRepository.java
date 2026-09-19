package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.RenovationProject;

import java.util.List;
import java.util.Optional;

public interface ProjectRepository {
    List<RenovationProject> findAll();

    Optional<RenovationProject> findById(String id);

    void insert(RenovationProject project);

    void replace(RenovationProject project);

    void delete(String id);
}
