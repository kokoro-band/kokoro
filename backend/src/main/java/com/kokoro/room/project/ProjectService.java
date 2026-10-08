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
import com.kokoro.room.floorplan.FloorPlanUploadValidator;
import com.kokoro.room.security.CurrentUser;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import com.kokoro.room.project.ProjectModels.RoomBounds;
import com.kokoro.room.project.ProjectModels.RoomModel;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR;

@Service
public class ProjectService {
    private static final Duration PROPOSAL_TTL = Duration.ofMinutes(5);
    private final ProjectRepository projectRepository;
    private final FloorPlanStorage floorPlanStorage;
    private final FloorPlanJobRepository floorPlanJobRepository;
    private final FloorPlanFileCleanup floorPlanFileCleanup;
    private final FurnitureRegistry furnitureRegistry;
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
                          RoomModelValidator roomModelValidator, LayoutProposalRepository layoutProposalRepository,
                          FloorPlanFileCleanup floorPlanFileCleanup, FurnitureRegistry furnitureRegistry) {
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
        this.floorPlanFileCleanup = floorPlanFileCleanup;
        this.furnitureRegistry = furnitureRegistry;
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
        ProjectInputLimits.name(request.name());
        ProjectInputLimits.roomType(request.roomType());
        ProjectInputLimits.dimensions(request.dimensions());
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

    @Transactional
    public void delete(String id) {
        RenovationProject project = lock(id, null);
        LinkedHashSet<String> objectKeys = new LinkedHashSet<>(floorPlanJobRepository.findObjectKeysByProject(id));
        if (project.floorPlan().objectKey() != null) {
            objectKeys.add(project.floorPlan().objectKey());
        }
        // Files are recorded here and removed after commit; a storage failure must not undo the delete.
        floorPlanFileCleanup.enqueue(id, objectKeys);
        floorPlanJobRepository.deleteByProject(id);
        projectRepository.delete(id);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                floorPlanFileCleanup.drain();
            }
        });
    }

    public RenovationProject uploadFloorPlan(String id, MultipartFile file) throws IOException {
        RenovationProject project = find(id);
        if (project.floorPlan().status() == ConversionStatus.PROCESSING && project.floorPlan().jobId() != null) {
            throw new ResponseStatusException(CONFLICT, "현재 도면 변환 작업이 진행 중입니다.");
        }

        FloorPlanStorage.StoredFloorPlan stored;
        try {
            MultipartFile validated = FloorPlanUploadValidator.validate(file);
            stored = floorPlanStorage.store(id, validated);
        } catch (IOException exception) {
            throw new ResponseStatusException(INTERNAL_SERVER_ERROR,
                    "도면 파일을 읽거나 저장하지 못했습니다. 다시 시도해 주세요.", exception);
        }
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
    public RenovationProject saveLayout(String id, List<FurnitureItem> furniture, Long expectedRevision) {
        RenovationProject project = lock(id, expectedRevision);
        furniturePlacementValidator.validateData(furniture);
        RenovationProject updated = copy(project, project.floorPlan(), new ArrayList<>(furniture));
        projectRepository.replace(updated);
        return updated;
    }

    @Transactional
    public RenovationProject saveRoom(String id, RoomModel room, Long expectedRevision) {
        RenovationProject project = lock(id, expectedRevision);
        roomModelValidator.validate(room);
        RenovationProject updated = new RenovationProject(project.id(), project.ownerId(), project.name(),
                project.roomType(), project.dimensions(), room, project.floorPlan(), project.furniture(), Instant.now(), project.revision() + 1);
        projectRepository.replace(updated);
        return updated;
    }

    @Transactional
    public ChatCommandResponse applyCommand(String id, String message, String furnitureId, Long expectedRevision) {
        RenovationProject project = lock(id, expectedRevision);
        ProjectInputLimits.message(message);
        LayoutCommandInterpreter.Interpretation interpretation = layoutCommandInterpreter.interpret(message, bounds(project));
        if (interpretation.requiresConfirmation()) {
            Instant now = Instant.now();
            Instant expiresAt = now.plus(PROPOSAL_TTL);
            String proposalId = UUID.randomUUID().toString();
            layoutProposalRepository.insert(new LayoutProposal(proposalId, id, currentUser.id(),
                    project.updatedAt(), project.revision(), interpretation.commands(), now, expiresAt, null));
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
        RenovationProject updated = saveLayout(id, next, project.revision());
        return new ChatCommandResponse(
                String.join(", ", actions) + "했습니다. 3D 공간에서 위치를 직접 조절할 수 있어요.",
                actions, interpretation.commands(), false, updated, null, null, List.of(), List.of()
        );
    }

    @Transactional
    public ChatCommandResponse confirmCommand(String id, String proposalId) {
        RenovationProject project = lock(id, null);
        LayoutProposal proposal = layoutProposalRepository.findById(proposalId)
                .filter(candidate -> candidate.projectId().equals(id) && candidate.ownerId().equals(currentUser.id()))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "확인할 제안을 찾을 수 없습니다."));

        if (proposal.consumedAt() != null) {
            return alreadyProcessed(proposal, project);
        }
        if (Instant.now().isAfter(proposal.expiresAt())) {
            throw new ResponseStatusException(CONFLICT, "제안이 만료되었습니다. 다시 요청해 주세요.");
        }
        if (proposal.baseRevision() == null || project.revision() != proposal.baseRevision()) {
            throw new ResponseStatusException(CONFLICT, "그 사이 배치가 바뀌어 다시 요청해야 합니다.");
        }
        if (!layoutProposalRepository.tryConsume(proposalId, Instant.now())) {
            return alreadyProcessed(proposal, find(id));
        }

        List<FurnitureItem> next = new ArrayList<>(project.furniture());
        List<String> actions = new ArrayList<>();
        applyProposalCommands(next, proposal.commands(), actions);
        furniturePlacementValidator.validate(project.dimensions(), project.room(), next);
        RenovationProject updated = actions.isEmpty() ? project : saveLayout(id, next, project.revision());
        return new ChatCommandResponse(String.join(", ", actions) + "했습니다.", actions, proposal.commands(),
                false, updated, proposal.proposalId(), proposal.expiresAt(), List.of(), List.of());
    }

    /**
     * Turns the intents a local model produced into a stored proposal. Nothing is applied here: the user must
     * confirm through {@link #confirmCommand}. Relative positions (MOVE, anchorQuery) wait for #62.
     */
    @Transactional
    public ChatCommandResponse proposeIntents(String id, JsonNode intentJson, Map<String, String> selections,
                                              Long expectedRevision) {
        RenovationProject project = lock(id, expectedRevision);
        List<LocalLayoutIntent.Intent> intents = LocalLayoutIntent.parse(intentJson);
        Map<String, String> chosen = selections == null ? Map.of() : selections;
        RoomBounds bounds = bounds(project);
        List<LayoutCommand> commands = new ArrayList<>();
        // The layout as it would look after the commands so far, so later intents see earlier ones.
        List<FurnitureItem> working = new ArrayList<>(project.furniture());
        int synced = 0;
        for (int index = 0; index < intents.size(); index++) {
            LocalLayoutIntent.Intent intent = intents.get(index);
            if (intent.type() == LocalLayoutIntent.Type.MOVE || intent.anchorQuery() != null) {
                throw new ResponseStatusException(BAD_REQUEST, "상대 위치 지정은 아직 지원하지 않습니다.");
            }
            switch (intent.type()) {
                case CLEAR -> commands.add(new LayoutCommand(LayoutActionType.CLEAR, null, null, null, null, null));
                case ADD -> {
                    JsonNode definition = furnitureRegistry.require(intent.catalogId());
                    double[] ratio = DEFAULT_ADD_RATIOS.getOrDefault(intent.catalogId(), new double[] {0.5, 0.5});
                    for (int copy = 0; copy < intent.count(); copy++) {
                        double shift = copy * (definition.path("width").doubleValue() + 0.1);
                        commands.add(new LayoutCommand(LayoutActionType.ADD, intent.catalogId(),
                                plannedId(working, project.revision(), intent.catalogId(), index, copy),
                                Math.round((bounds.width() * ratio[0] + shift) * 100) / 100.0,
                                Math.round(bounds.depth() * ratio[1] * 100) / 100.0, 0));
                    }
                }
                default -> {
                    List<FurnitureItem> matches = working.stream()
                            .filter(item -> matchesQuery(item, intent.targetQuery())).toList();
                    String picked = chosen.get(String.valueOf(index));
                    FurnitureItem target;
                    if (picked != null) {
                        target = matches.stream().filter(item -> item.id().equals(picked)).findFirst()
                                .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "선택한 가구가 대상이 아닙니다."));
                    } else if (matches.isEmpty()) {
                        throw new ResponseStatusException(BAD_REQUEST, "대상 가구를 찾을 수 없습니다: " + intent.targetQuery());
                    } else if (matches.size() > 1) {
                        List<LayoutCandidate> candidates = matches.stream()
                                .map(item -> new LayoutCandidate(item.id(), item.name())).toList();
                        return new ChatCommandResponse((index + 1) + "번째 명령의 대상을 선택해 주세요.", List.of(), List.of(),
                                false, project, null, null, List.of(), candidates);
                    } else {
                        target = matches.get(0);
                    }
                    Integer rotation = null;
                    if (intent.type() == LocalLayoutIntent.Type.ROTATE) {
                        if (intent.rotation() != Math.rint(intent.rotation())) {
                            throw new ResponseStatusException(BAD_REQUEST, "회전은 정수 각도만 지원합니다.");
                        }
                        rotation = (int) Math.rint(intent.rotation());
                    }
                    commands.add(new LayoutCommand(LayoutActionType.valueOf(intent.type().name()),
                            target.catalogId(), target.id(), null, null, rotation));
                }
            }
            applyProposalCommands(working, commands.subList(synced, commands.size()), new ArrayList<>());
            synced = commands.size();
        }

        // Dry run: reject a proposal that would not be applicable, then store it for the one-time confirm.
        List<FurnitureItem> next = new ArrayList<>(project.furniture());
        List<String> actions = new ArrayList<>();
        applyProposalCommands(next, commands, actions);
        furniturePlacementValidator.validate(project.dimensions(), project.room(), next);

        Instant now = Instant.now();
        Instant expiresAt = now.plus(PROPOSAL_TTL);
        String proposalId = UUID.randomUUID().toString();
        layoutProposalRepository.insert(new LayoutProposal(proposalId, id, currentUser.id(),
                project.updatedAt(), project.revision(), commands, now, expiresAt, null));
        return new ChatCommandResponse(String.join(", ", actions) + " 내용을 확인해 주세요.", List.of(), commands, true,
                project, proposalId, expiresAt, commands, List.of());
    }

    private static final Map<String, double[]> DEFAULT_ADD_RATIOS = Map.of(
            "sofa-cloud", new double[] {0.24, 0.67}, "table-oak", new double[] {0.54, 0.48},
            "chair-shell", new double[] {0.68, 0.34}, "plant-olive", new double[] {0.84, 0.74});

    /**
     * Added furniture gets its id when the proposal is made, so the dry run, later intents of the same request
     * and the confirm all see the same id. It depends only on the project revision and the intent position, so
     * asking again after choosing a candidate produces the same id.
     */
    private static String plannedId(List<FurnitureItem> layout, long revision, String catalogId, int index, int copy) {
        String id = "%s-r%d-%d-%d".formatted(catalogId, revision, index, copy);
        while (true) {
            String candidate = id;
            if (layout.stream().noneMatch(item -> item.id().equals(candidate))) return candidate;
            id = id + "x";
        }
    }

    private static boolean matchesQuery(FurnitureItem item, String query) {
        String q = compact(query);
        String name = compact(item.name());
        return name.contains(q) || q.contains(name) || q.contains(compact(item.category()))
                || q.equals(compact(item.catalogId()));
    }

    private static String compact(String value) {
        return value.replace(" ", "").toLowerCase(Locale.ROOT);
    }

    /** Applies stored proposal commands; shared by the dry run and the confirm so both behave the same. */
    private void applyProposalCommands(List<FurnitureItem> next, List<LayoutCommand> commands, List<String> actions) {
        for (LayoutCommand command : commands) {
            switch (command.type()) {
                case CLEAR -> {
                    next.clear();
                    actions.add("전체 삭제");
                }
                case ADD -> {
                    JsonNode definition = furnitureRegistry.require(command.catalogId());
                    FurnitureItem item = furniture(command.furnitureId() != null ? command.furnitureId() : unique(command.catalogId()),
                            command.catalogId(),
                            definition.path("name").asString(), definition.path("category").asString(),
                            command.x(), command.z(), command.rotation() == null ? 0 : command.rotation(),
                            definition.path("color").asString());
                    next.add(item);
                    actions.add(item.name() + " 배치");
                }
                case REMOVE, ROTATE -> {
                    FurnitureItem target = next.stream().filter(item -> item.id().equals(command.furnitureId()))
                            .findFirst().orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "대상 가구를 찾을 수 없습니다."));
                    if (command.type() == LayoutActionType.REMOVE) {
                        next.remove(target);
                        actions.add(target.name() + " 삭제");
                    } else {
                        next.set(next.indexOf(target), new FurnitureItem(target.id(), target.catalogId(), target.name(),
                                target.category(), target.x(), target.z(), command.rotation().doubleValue(), target.color()));
                        actions.add(target.name() + " 회전");
                    }
                }
                case MOVE -> throw new ResponseStatusException(BAD_REQUEST, "상대 위치 지정은 아직 지원하지 않습니다.");
            }
        }
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
                        target.category(), target.x(), target.z(), original.rotation().doubleValue(), target.color()));
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
                project.room(), floorPlan, furniture, Instant.now(), project.revision() + 1);
    }

    private RenovationProject lock(String id, Long expectedRevision) {
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
                                           double x, double z, double rotation, String color) {
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
