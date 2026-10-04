package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.ChatCommandRequest;
import com.kokoro.room.project.ProjectModels.ChatCommandResponse;
import com.kokoro.room.project.ProjectModels.ConfirmCommandRequest;
import com.kokoro.room.project.ProjectModels.CreateProjectRequest;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import com.kokoro.room.project.ProjectModels.FloorPlanJob;
import com.kokoro.room.project.ProjectModels.SaveLayoutRequest;
import com.kokoro.room.project.ProjectModels.SaveRoomRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {
    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @GetMapping
    public List<RenovationProject> findAll() {
        return projectService.findAll();
    }

    @GetMapping("/{projectId}")
    public RenovationProject find(@PathVariable String projectId) {
        return projectService.find(projectId);
    }

    @DeleteMapping("/{projectId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String projectId) throws IOException {
        projectService.delete(projectId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RenovationProject create(@Valid @RequestBody CreateProjectRequest request) {
        return projectService.create(request);
    }

    @PostMapping(path = "/{projectId}/floor-plan", consumes = "multipart/form-data")
    public RenovationProject uploadFloorPlan(
            @PathVariable String projectId,
            @RequestPart("file") MultipartFile file
    ) throws IOException {
        return projectService.uploadFloorPlan(projectId, file);
    }

    @GetMapping("/{projectId}/floor-plan/jobs/{jobId}")
    public FloorPlanJob floorPlanJob(@PathVariable String projectId, @PathVariable String jobId) {
        return projectService.findFloorPlanJob(projectId, jobId);
    }

    @PutMapping("/{projectId}/room")
    public RenovationProject saveRoom(
            @PathVariable String projectId,
            @Valid @RequestBody SaveRoomRequest request
    ) {
        return projectService.saveRoom(projectId, request.room(), request.expectedRevision());
    }

    @PutMapping("/{projectId}/layout")
    public RenovationProject saveLayout(
            @PathVariable String projectId,
            @Valid @RequestBody SaveLayoutRequest request
    ) {
        return projectService.saveLayout(projectId, request.furniture(), request.expectedRevision());
    }

    @PostMapping("/{projectId}/layout/commands")
    public ChatCommandResponse applyCommand(
            @PathVariable String projectId,
            @Valid @RequestBody ChatCommandRequest request
    ) {
        return projectService.applyCommand(projectId, request.message(), request.furnitureId(), request.expectedRevision());
    }

    @PostMapping("/{projectId}/layout/commands/confirm")
    public ChatCommandResponse confirmCommand(
            @PathVariable String projectId,
            @Valid @RequestBody ConfirmCommandRequest request
    ) {
        return projectService.confirmCommand(projectId, request.proposalId());
    }
}
