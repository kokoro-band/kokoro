package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.ChatCommandResponse;
import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.CreateProjectRequest;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FloorPlan;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.FloorPlanJob;
import com.kokoro.room.project.ProjectModels.LayoutActionType;
import com.kokoro.room.project.ProjectModels.LayoutCommand;
import com.kokoro.room.floorplan.FloorPlanStorage;
import com.kokoro.room.security.CurrentUser;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import com.kokoro.room.project.ProjectModels.RoomBounds;
import com.kokoro.room.project.ProjectModels.RoomModel;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class ProjectService {
    private static final long MAX_FLOOR_PLAN_BYTES = 15L * 1024 * 1024;
    private final ProjectRepository projectRepository;
    private final FloorPlanStorage floorPlanStorage;
    private final FloorPlanJobRepository floorPlanJobRepository;
    private final FloorPlanJobDispatcher floorPlanJobDispatcher;
    private final FurniturePlacementValidator furniturePlacementValidator;
    private final CurrentUser currentUser;
    private final LayoutCommandInterpreter layoutCommandInterpreter;
    private final RoomModelValidator roomModelValidator;

    public ProjectService(ProjectRepository projectRepository, FloorPlanStorage floorPlanStorage,
                          FloorPlanJobRepository floorPlanJobRepository, FloorPlanJobDispatcher floorPlanJobDispatcher,
                          FurniturePlacementValidator furniturePlacementValidator,
                          CurrentUser currentUser, LayoutCommandInterpreter layoutCommandInterpreter,
                          RoomModelValidator roomModelValidator) {
        this.projectRepository = projectRepository;
        this.floorPlanStorage = floorPlanStorage;
        this.floorPlanJobRepository = floorPlanJobRepository;
        this.floorPlanJobDispatcher = floorPlanJobDispatcher;
        this.furniturePlacementValidator = furniturePlacementValidator;
        this.currentUser = currentUser;
        this.layoutCommandInterpreter = layoutCommandInterpreter;
        this.roomModelValidator = roomModelValidator;
        if (projectRepository.findById("living-room-01").isEmpty()) {
            RenovationProject sample = new RenovationProject(
                    "living-room-01",
                    currentUser.id(),
                    "성수동 거실",
                    "거실",
                    new Dimensions(5.8, 4.2, 2.4),
                    null,
                    new FloorPlan("sample-floor-plan.pdf", 842_000, ConversionStatus.READY, 100, Instant.now(), null, null, null, null, false),
                    new ArrayList<>(List.of(
                            furniture("sofa-01", "sofa-cloud", "클라우드 소파", "소파", 1.6, 2.9, 0, "#D8C8B8"),
                            furniture("table-01", "table-oak", "오크 테이블", "테이블", 3.2, 2.2, 0, "#B98958"),
                            furniture("chair-01", "chair-shell", "셸 체어", "의자", 4.2, 1.3, 25, "#4A665A"),
                            furniture("plant-01", "plant-olive", "올리브 화분", "장식", 4.9, 3.2, 0, "#69805E")
                    )),
                    Instant.now(), 0
            );
            projectRepository.insert(sample);
        }
    }

    public List<RenovationProject> findAll() {
        return projectRepository.findAll().stream().filter(this::owned).toList();
    }

    public RenovationProject find(String id) {
        return projectRepository.findById(id).filter(this::owned)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "프로젝트를 찾을 수 없습니다."));
    }

    @Transactional
    public RenovationProject create(CreateProjectRequest request) {
        String id = UUID.randomUUID().toString();
        RenovationProject project = new RenovationProject(
                id,
                currentUser.id(),
                request.name(),
                request.roomType(),
                request.dimensions(),
                null,
                new FloorPlan("", 0, ConversionStatus.EMPTY, 0, null, null, null, null, null, false),
                new ArrayList<>(),
                Instant.now(), 0
        );
        projectRepository.insert(project);
        return project;
    }

    @Transactional(rollbackFor = IOException.class)
    public void delete(String id) throws IOException {
        RenovationProject project = lock(id, null);
        if (project.floorPlan().objectKey() != null) {
            floorPlanStorage.delete(project.floorPlan().objectKey());
        }
        floorPlanJobRepository.deleteByProject(id);
        projectRepository.delete(id);
    }

    @Transactional(rollbackFor = IOException.class)
    public RenovationProject uploadFloorPlan(String id, MultipartFile file) throws IOException {
        RenovationProject project = lock(id, null);
        if (file.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "도면 파일이 비어 있습니다.");
        if (file.getSize() > MAX_FLOOR_PLAN_BYTES) throw new ResponseStatusException(BAD_REQUEST, "도면은 15MB 이하여야 합니다.");

        String contentType = file.getContentType() == null ? "" : file.getContentType();
        if (!List.of("application/pdf", "image/png", "image/jpeg").contains(contentType)) {
            throw new ResponseStatusException(BAD_REQUEST, "PDF, PNG, JPG 도면만 업로드할 수 있습니다.");
        }
        if (project.floorPlan().status() == ConversionStatus.PROCESSING && project.floorPlan().jobId() != null) {
            throw new ResponseStatusException(CONFLICT, "현재 도면 변환 작업이 진행 중입니다.");
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
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                floorPlanJobDispatcher.dispatch(id, jobId);
            }
        });
        return updated;
    }

    public FloorPlanJob findFloorPlanJob(String projectId, String jobId) {
        return floorPlanJobRepository.findById(projectId, jobId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "도면 변환 작업을 찾을 수 없습니다."));
    }

    @Transactional
    public RenovationProject saveLayout(String id, List<FurnitureItem> furniture, Long expectedRevision) {
        RenovationProject project = lock(id, expectedRevision);
        furniturePlacementValidator.validate(project.dimensions(), project.room(), furniture);
        RenovationProject updated = copy(project, project.floorPlan(), new ArrayList<>(furniture));
        projectRepository.replace(updated);
        return updated;
    }

    @Transactional
    public RenovationProject saveRoom(String id, RoomModel room, Long expectedRevision) {
        RenovationProject project = lock(id, expectedRevision);
        roomModelValidator.validate(room);
        RenovationProject updated = new RenovationProject(project.id(), project.ownerId(), project.name(),
                project.roomType(), project.dimensions(), room, project.floorPlan(), project.furniture(), Instant.now(),
                project.revision() + 1);
        furniturePlacementValidator.validate(updated.dimensions(), room, updated.furniture());
        projectRepository.replace(updated);
        return updated;
    }

    @Transactional
    public ChatCommandResponse applyCommand(String id, String message, Long expectedRevision) {
        RenovationProject project = lock(id, expectedRevision);
        LayoutCommandInterpreter.Interpretation interpretation = layoutCommandInterpreter.interpret(message, bounds(project));
        if (interpretation.requiresConfirmation()) {
            return new ChatCommandResponse(interpretation.reply(), List.of(), interpretation.commands(), true, project);
        }
        List<FurnitureItem> next = new ArrayList<>(project.furniture());
        List<String> actions = new ArrayList<>();
        for (LayoutCommand command : interpretation.commands()) {
            FurnitureItem target = next.stream().filter(item -> item.catalogId().equals(command.catalogId())).findFirst().orElse(null);
            if (command.type() == LayoutActionType.ADD) {
                FurnitureItem item = furniture(unique(command.catalogId()), command.catalogId(), displayName(command.catalogId()),
                        category(command.catalogId()), command.x(), command.z(), command.rotation(), color(command.catalogId()));
                next.add(item);
                actions.add(item.name() + " 배치");
            } else if (target != null && command.type() == LayoutActionType.REMOVE) {
                next.remove(target);
                actions.add(target.name() + " 삭제");
            } else if (target != null && command.type() == LayoutActionType.MOVE) {
                next.set(next.indexOf(target), new FurnitureItem(target.id(), target.catalogId(), target.name(), target.category(),
                        command.x(), command.z(), target.rotation(), target.color()));
                actions.add(target.name() + " 이동");
            } else if (target != null && command.type() == LayoutActionType.ROTATE) {
                next.set(next.indexOf(target), new FurnitureItem(target.id(), target.catalogId(), target.name(), target.category(),
                        target.x(), target.z(), command.rotation(), target.color()));
                actions.add(target.name() + " 회전");
            }
        }
        if (actions.isEmpty()) {
            return new ChatCommandResponse(
                    interpretation.reply(), List.of(), interpretation.commands(), false,
                    project
            );
        }

        RenovationProject updated = saveLayout(id, next, project.revision());
        return new ChatCommandResponse(
                String.join(", ", actions) + "했습니다. 3D 공간에서 위치를 직접 조절할 수 있어요.",
                actions, interpretation.commands(), false,
                updated
        );
    }

    private static String displayName(String catalogId) {
        return switch (catalogId) {
            case "sofa-cloud" -> "클라우드 소파";
            case "table-oak" -> "오크 테이블";
            case "chair-shell" -> "셸 체어";
            case "plant-olive" -> "올리브 화분";
            default -> catalogId;
        };
    }

    private static String category(String catalogId) {
        return switch (catalogId) {
            case "sofa-cloud" -> "소파";
            case "table-oak" -> "테이블";
            case "chair-shell" -> "의자";
            default -> "장식";
        };
    }

    private static String color(String catalogId) {
        return switch (catalogId) {
            case "sofa-cloud" -> "#D8C8B8";
            case "table-oak" -> "#B98958";
            case "chair-shell" -> "#4A665A";
            default -> "#69805E";
        };
    }

    private RenovationProject copy(RenovationProject project, FloorPlan floorPlan, List<FurnitureItem> furniture) {
        return new RenovationProject(
                project.id(), project.ownerId(), project.name(), project.roomType(), project.dimensions(),
                project.room(), floorPlan, furniture, Instant.now(), project.revision() + 1);
    }

    RenovationProject lock(String id, Long expectedRevision) {
        RenovationProject project = projectRepository.lockById(id).filter(this::owned)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "프로젝트를 찾을 수 없습니다."));
        if (expectedRevision != null && expectedRevision != project.revision()) {
            throw new ResponseStatusException(CONFLICT, "프로젝트가 변경되었습니다. 최신 상태를 불러와 주세요.");
        }
        return project;
    }

    private static RoomBounds bounds(RenovationProject project) {
        if (project.room() != null && project.room().bounds() != null) return project.room().bounds();
        return new RoomBounds(project.dimensions().width(), project.dimensions().depth());
    }

    private boolean owned(RenovationProject project) {
        return project.ownerId().equals(currentUser.id());
    }

    private static FurnitureItem furniture(String id, String catalogId, String name, String category,
                                           double x, double z, int rotation, String color) {
        return new FurnitureItem(id, catalogId, name, category, x, z, rotation, color);
    }

    private static String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
