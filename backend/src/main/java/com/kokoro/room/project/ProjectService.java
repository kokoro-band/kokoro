package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.ChatCommandResponse;
import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.CreateProjectRequest;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FloorPlan;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.FloorPlanJob;
import com.kokoro.room.project.ProjectModels.LayoutActionType;
import com.kokoro.room.project.ProjectModels.LayoutCandidate;
import com.kokoro.room.project.ProjectModels.LayoutCommand;
import com.kokoro.room.project.ProjectModels.LayoutProposal;
import com.kokoro.room.floorplan.FloorPlanStorage;
import com.kokoro.room.security.CurrentUser;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import com.kokoro.room.project.ProjectModels.RoomBounds;
import com.kokoro.room.project.ProjectModels.RoomModel;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.transaction.annotation.Transactional;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class ProjectService {
    private static final long MAX_FLOOR_PLAN_BYTES = 15L * 1024 * 1024;
    private static final Duration PROPOSAL_TTL = Duration.ofMinutes(5);
    private final ProjectRepository projectRepository;
    private final FloorPlanStorage floorPlanStorage;
    private final FloorPlanJobRepository floorPlanJobRepository;
    private final FloorPlanJobDispatcher floorPlanJobDispatcher;
    private final FloorPlanJobCoordinator floorPlanJobCoordinator;
    private final FurniturePlacementValidator furniturePlacementValidator;
    private final CurrentUser currentUser;
    private final LayoutCommandInterpreter layoutCommandInterpreter;
    private final RoomModelValidator roomModelValidator;
    private final LayoutProposalRepository layoutProposalRepository;

    public ProjectService(ProjectRepository projectRepository, FloorPlanStorage floorPlanStorage,
                          FloorPlanJobRepository floorPlanJobRepository, FloorPlanJobDispatcher floorPlanJobDispatcher,
                          FloorPlanJobCoordinator floorPlanJobCoordinator,
                          FurniturePlacementValidator furniturePlacementValidator,
                          CurrentUser currentUser, LayoutCommandInterpreter layoutCommandInterpreter,
                          RoomModelValidator roomModelValidator, LayoutProposalRepository layoutProposalRepository) {
        this.projectRepository = projectRepository;
        this.floorPlanStorage = floorPlanStorage;
        this.floorPlanJobRepository = floorPlanJobRepository;
        this.floorPlanJobDispatcher = floorPlanJobDispatcher;
        this.floorPlanJobCoordinator = floorPlanJobCoordinator;
        this.furniturePlacementValidator = furniturePlacementValidator;
        this.currentUser = currentUser;
        this.layoutCommandInterpreter = layoutCommandInterpreter;
        this.roomModelValidator = roomModelValidator;
        this.layoutProposalRepository = layoutProposalRepository;
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
                    Instant.now()
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
                Instant.now()
        );
        projectRepository.insert(project);
        return project;
    }

    @Transactional
    public void delete(String id) throws IOException {
        RenovationProject project = find(id);
        if (project.floorPlan().objectKey() != null) {
            floorPlanStorage.delete(project.floorPlan().objectKey());
        }
        floorPlanJobRepository.deleteByProject(id);
        projectRepository.delete(id);
    }

    public RenovationProject uploadFloorPlan(String id, MultipartFile file) throws IOException {
        RenovationProject project = find(id);
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
        RenovationProject updated;
        try {
            updated = floorPlanJobCoordinator.start(id, project.ownerId(), jobId, stored, Instant.now());
        } catch (RuntimeException | Error exception) {
            cleanupStoredFile(stored.objectKey(), exception);
            throw exception;
        }
        try {
            floorPlanJobDispatcher.dispatch(id, jobId);
        } catch (RuntimeException exception) {
            floorPlanJobCoordinator.fail(id, jobId, "DISPATCH_FAILED", "도면 변환 작업을 시작하지 못했습니다.");
            throw exception;
        }
        return updated;
    }

    public FloorPlanJob findFloorPlanJob(String projectId, String jobId) {
        find(projectId);
        return floorPlanJobRepository.findById(projectId, jobId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "도면 변환 작업을 찾을 수 없습니다."));
    }

    @Transactional
    public RenovationProject saveLayout(String id, List<FurnitureItem> furniture) {
        RenovationProject project = find(id);
        furniturePlacementValidator.validateData(furniture);
        RenovationProject updated = copy(project, project.floorPlan(), new ArrayList<>(furniture));
        projectRepository.replace(updated);
        return updated;
    }

    @Transactional
    public RenovationProject saveRoom(String id, RoomModel room) {
        RenovationProject project = find(id);
        roomModelValidator.validate(room);
        RenovationProject updated = new RenovationProject(project.id(), project.ownerId(), project.name(),
                project.roomType(), project.dimensions(), room, project.floorPlan(), project.furniture(), Instant.now());
        projectRepository.replace(updated);
        return updated;
    }

    @Transactional
    public ChatCommandResponse applyCommand(String id, String message, String furnitureId) {
        RenovationProject project = find(id);
        LayoutCommandInterpreter.Interpretation interpretation = layoutCommandInterpreter.interpret(message, bounds(project));
        if (interpretation.requiresConfirmation()) {
            Instant now = Instant.now();
            Instant expiresAt = now.plus(PROPOSAL_TTL);
            String proposalId = UUID.randomUUID().toString();
            layoutProposalRepository.insert(new LayoutProposal(proposalId, id, currentUser.id(),
                    project.updatedAt(), interpretation.commands(), now, expiresAt, null));
            return new ChatCommandResponse(interpretation.reply(), List.of(), interpretation.commands(), true,
                    project, proposalId, expiresAt, interpretation.commands(), List.of());
        }

        List<ResolvedCommand> resolved = new ArrayList<>();
        for (LayoutCommand command : interpretation.commands()) {
            if (command.type() == LayoutActionType.ADD) {
                resolved.add(new ResolvedCommand(command, null));
                continue;
            }
            if (furnitureId != null) {
                FurnitureItem target = project.furniture().stream()
                        .filter(item -> item.id().equals(furnitureId)).findFirst()
                        .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "대상 가구를 찾을 수 없습니다."));
                resolved.add(new ResolvedCommand(command, target));
                continue;
            }
            List<FurnitureItem> matches = project.furniture().stream()
                    .filter(item -> item.catalogId().equals(command.catalogId())).toList();
            if (matches.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "대상 가구를 찾을 수 없습니다.");
            if (matches.size() > 1) {
                List<LayoutCandidate> candidates = matches.stream()
                        .map(item -> new LayoutCandidate(item.id(), item.name())).toList();
                return new ChatCommandResponse("어떤 가구를 대상으로 할지 선택해 주세요.", List.of(),
                        interpretation.commands(), false, project, null, null, List.of(), candidates);
            }
            resolved.add(new ResolvedCommand(command, matches.get(0)));
        }

        List<FurnitureItem> next = new ArrayList<>(project.furniture());
        List<String> actions = new ArrayList<>();
        for (ResolvedCommand command : resolved) {
            applyResolvedCommand(next, command, actions);
        }
        if (actions.isEmpty()) {
            return new ChatCommandResponse(interpretation.reply(), List.of(), interpretation.commands(), false,
                    project, null, null, List.of(), List.of());
        }

        furniturePlacementValidator.validate(project.dimensions(), project.room(), next);
        RenovationProject updated = saveLayout(id, next);
        return new ChatCommandResponse(
                String.join(", ", actions) + "했습니다. 3D 공간에서 위치를 직접 조절할 수 있어요.",
                actions, interpretation.commands(), false, updated, null, null, List.of(), List.of()
        );
    }

    @Transactional
    public ChatCommandResponse confirmCommand(String id, String proposalId) {
        RenovationProject project = find(id);
        LayoutProposal proposal = layoutProposalRepository.findById(proposalId)
                .filter(candidate -> candidate.projectId().equals(id) && candidate.ownerId().equals(currentUser.id()))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "확인할 제안을 찾을 수 없습니다."));

        if (proposal.consumedAt() != null) {
            return alreadyProcessed(proposal, project);
        }
        if (Instant.now().isAfter(proposal.expiresAt())) {
            throw new ResponseStatusException(CONFLICT, "제안이 만료되었습니다. 다시 요청해 주세요.");
        }
        if (!project.updatedAt().equals(proposal.baseUpdatedAt())) {
            throw new ResponseStatusException(CONFLICT, "그 사이 배치가 바뀌어 다시 요청해야 합니다.");
        }
        if (!layoutProposalRepository.tryConsume(proposalId, Instant.now())) {
            return alreadyProcessed(proposal, find(id));
        }

        List<FurnitureItem> next = new ArrayList<>(project.furniture());
        List<String> actions = new ArrayList<>();
        for (LayoutCommand command : proposal.commands()) {
            if (command.type() == LayoutActionType.CLEAR) {
                next.clear();
                actions.add("전체 삭제");
            }
        }
        furniturePlacementValidator.validate(project.dimensions(), project.room(), next);
        RenovationProject updated = actions.isEmpty() ? project : saveLayout(id, next);
        return new ChatCommandResponse(String.join(", ", actions) + "했습니다.", actions, proposal.commands(),
                false, updated, proposal.proposalId(), proposal.expiresAt(), List.of(), List.of());
    }

    private ChatCommandResponse alreadyProcessed(LayoutProposal proposal, RenovationProject project) {
        return new ChatCommandResponse("이미 처리된 요청입니다.", List.of(), proposal.commands(), false, project,
                proposal.proposalId(), proposal.expiresAt(), List.of(), List.of());
    }

    private void applyResolvedCommand(List<FurnitureItem> next, ResolvedCommand command, List<String> actions) {
        LayoutCommand original = command.command();
        switch (original.type()) {
            case ADD -> {
                FurnitureItem item = furniture(unique(original.catalogId()), original.catalogId(),
                        displayName(original.catalogId()), category(original.catalogId()),
                        original.x(), original.z(), original.rotation(), color(original.catalogId()));
                next.add(item);
                actions.add(item.name() + " 배치");
            }
            case REMOVE -> {
                next.remove(command.target());
                actions.add(command.target().name() + " 삭제");
            }
            case MOVE -> {
                FurnitureItem target = command.target();
                next.set(next.indexOf(target), new FurnitureItem(target.id(), target.catalogId(), target.name(),
                        target.category(), original.x(), original.z(), target.rotation(), target.color()));
                actions.add(target.name() + " 이동");
            }
            case ROTATE -> {
                FurnitureItem target = command.target();
                next.set(next.indexOf(target), new FurnitureItem(target.id(), target.catalogId(), target.name(),
                        target.category(), target.x(), target.z(), original.rotation(), target.color()));
                actions.add(target.name() + " 회전");
            }
            case CLEAR -> { /* CLEAR only ever reaches the confirm flow. */ }
        }
    }

    /** Pairs an interpreted command with the concrete furniture it targets, resolved before anything is mutated. */
    private record ResolvedCommand(LayoutCommand command, FurnitureItem target) {}

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
                project.room(), floorPlan, furniture, Instant.now());
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

    private void cleanupStoredFile(String objectKey, Throwable original) {
        try {
            floorPlanStorage.delete(objectKey);
        } catch (IOException cleanupFailure) {
            original.addSuppressed(cleanupFailure);
        }
    }
}
