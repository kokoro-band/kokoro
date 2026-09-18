package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.ChatCommandResponse;
import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.CreateProjectRequest;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FloorPlan;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.FloorPlanJob;
import com.kokoro.room.floorplan.FloorPlanStorage;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.transaction.annotation.Transactional;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class ProjectService {
    private static final long MAX_FLOOR_PLAN_BYTES = 15L * 1024 * 1024;
    private final ProjectRepository projectRepository;
    private final FloorPlanStorage floorPlanStorage;
    private final FloorPlanJobRepository floorPlanJobRepository;
    private final FloorPlanJobDispatcher floorPlanJobDispatcher;

    public ProjectService(ProjectRepository projectRepository, FloorPlanStorage floorPlanStorage,
                          FloorPlanJobRepository floorPlanJobRepository, FloorPlanJobDispatcher floorPlanJobDispatcher) {
        this.projectRepository = projectRepository;
        this.floorPlanStorage = floorPlanStorage;
        this.floorPlanJobRepository = floorPlanJobRepository;
        this.floorPlanJobDispatcher = floorPlanJobDispatcher;
        if (projectRepository.findById("living-room-01").isEmpty()) {
            RenovationProject sample = new RenovationProject(
                    "living-room-01",
                    "성수동 거실",
                    "거실",
                    new Dimensions(5.8, 4.2, 2.4),
                    new FloorPlan("sample-floor-plan.pdf", 842_000, ConversionStatus.READY, 100, Instant.now(), null, null, null, null, false),
                    new ArrayList<>(List.of(
                            furniture("sofa-01", "sofa-cloud", "클라우드 소파", "소파", 28, 68, 0, "#D8C8B8"),
                            furniture("table-01", "table-oak", "오크 테이블", "테이블", 55, 52, 0, "#B98958"),
                            furniture("chair-01", "chair-shell", "셸 체어", "의자", 73, 32, 25, "#4A665A"),
                            furniture("plant-01", "plant-olive", "올리브 화분", "장식", 84, 76, 0, "#69805E")
                    )),
                    Instant.now()
            );
            projectRepository.insert(sample);
        }
    }

    public List<RenovationProject> findAll() {
        return projectRepository.findAll();
    }

    public RenovationProject find(String id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "프로젝트를 찾을 수 없습니다."));
    }

    @Transactional
    public RenovationProject create(CreateProjectRequest request) {
        String id = UUID.randomUUID().toString();
        RenovationProject project = new RenovationProject(
                id,
                request.name(),
                request.roomType(),
                request.dimensions(),
                new FloorPlan("", 0, ConversionStatus.EMPTY, 0, null, null, null, null, null, false),
                new ArrayList<>(),
                Instant.now()
        );
        projectRepository.insert(project);
        return project;
    }

    public RenovationProject uploadFloorPlan(String id, MultipartFile file) throws IOException {
        RenovationProject project = find(id);
        if (file.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "도면 파일이 비어 있습니다.");
        if (file.getSize() > MAX_FLOOR_PLAN_BYTES) throw new ResponseStatusException(BAD_REQUEST, "도면은 15MB 이하여야 합니다.");

        String contentType = file.getContentType() == null ? "" : file.getContentType();
        if (!List.of("application/pdf", "image/png", "image/jpeg").contains(contentType)) {
            throw new ResponseStatusException(BAD_REQUEST, "PDF, PNG, JPG 도면만 업로드할 수 있습니다.");
        }

        FloorPlanStorage.StoredFloorPlan stored = floorPlanStorage.store(id, file);
        String jobId = UUID.randomUUID().toString();
        Instant createdAt = Instant.now();
        floorPlanJobRepository.insert(new FloorPlanJob(jobId, id, stored.objectKey(), ConversionStatus.PROCESSING,
                0, null, null, true, createdAt, null, null));
        FloorPlan floorPlan = new FloorPlan(
                stored.fileName(), stored.size(), ConversionStatus.PROCESSING, 0, createdAt, jobId,
                stored.objectKey(), null, null, true);
        RenovationProject updated = copy(project, floorPlan, project.furniture());
        projectRepository.replace(updated);
        floorPlanJobDispatcher.dispatch(id, jobId);
        return updated;
    }

    public FloorPlanJob findFloorPlanJob(String projectId, String jobId) {
        return floorPlanJobRepository.findById(projectId, jobId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "도면 변환 작업을 찾을 수 없습니다."));
    }

    @Transactional
    public RenovationProject saveLayout(String id, List<FurnitureItem> furniture) {
        RenovationProject project = find(id);
        RenovationProject updated = copy(project, project.floorPlan(), new ArrayList<>(furniture));
        projectRepository.replace(updated);
        return updated;
    }

    @Transactional
    public ChatCommandResponse applyCommand(String id, String message) {
        RenovationProject project = find(id);
        String normalized = message.replace(" ", "").toLowerCase();
        List<FurnitureItem> next = new ArrayList<>(project.furniture());
        List<String> actions = new ArrayList<>();

        if (normalized.contains("비워") || normalized.contains("전부삭제")) {
            next.clear();
            actions.add("가구 전체 제거");
        } else {
            if (normalized.contains("소파")) {
                next.add(furniture(unique("sofa"), "sofa-cloud", "클라우드 소파", "소파", 24, 67, 0, "#D8C8B8"));
                actions.add("소파를 창가 반대편에 배치");
            }
            if (normalized.contains("테이블") || normalized.contains("책상")) {
                next.add(furniture(unique("table"), "table-oak", "오크 테이블", "테이블", 54, 48, 0, "#B98958"));
                actions.add("테이블을 공간 중앙에 배치");
            }
            if (normalized.contains("의자")) {
                next.add(furniture(unique("chair"), "chair-shell", "셸 체어", "의자", 68, 34, 15, "#4A665A"));
                actions.add("의자를 테이블 가까이에 배치");
            }
            if (normalized.contains("식물") || normalized.contains("화분")) {
                next.add(furniture(unique("plant"), "plant-olive", "올리브 화분", "장식", 84, 74, 0, "#69805E"));
                actions.add("화분을 채광이 좋은 모서리에 배치");
            }
        }

        if (actions.isEmpty()) {
            return new ChatCommandResponse(
                    "소파, 테이블, 의자, 화분 중 원하는 가구와 위치를 함께 말해 주세요.",
                    List.of(),
                    project
            );
        }

        RenovationProject updated = saveLayout(id, next);
        return new ChatCommandResponse(
                String.join("하고 ", actions) + "했습니다. 3D 공간에서 위치를 직접 조절할 수 있어요.",
                actions,
                updated
        );
    }

    private RenovationProject copy(RenovationProject project, FloorPlan floorPlan, List<FurnitureItem> furniture) {
        return new RenovationProject(
                project.id(), project.name(), project.roomType(), project.dimensions(), floorPlan, furniture, Instant.now());
    }

    private static FurnitureItem furniture(String id, String catalogId, String name, String category,
                                           double x, double z, int rotation, String color) {
        return new FurnitureItem(id, catalogId, name, category, x, z, rotation, color);
    }

    private static String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
