package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.springframework.http.HttpStatus.*;

/** Only server-validated snapshots can be confirmed. The browser never submits a layout to confirm. */
@Service
public class LayoutProposalService {
    public record PreviewRequest(@NotNull @PositiveOrZero Long expectedRevision,
                                 @NotNull @Size(min = 1, max = 8) List<LayoutCommand> commands) {}
    public record View(String id, String status, long baseRevision, Instant expiresAt,
                       List<FurnitureItem> proposedFurniture, List<String> actions, JsonNode result) {}
    private record Stored(String id, String status, long baseRevision, Instant expiresAt,
                          List<FurnitureItem> furniture, List<String> actions, JsonNode result) {}

    private final ProjectService projects;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final FurnitureRegistry catalog;
    private final FurniturePlacementValidator placements;

    public LayoutProposalService(ProjectService projects, JdbcTemplate jdbc, ObjectMapper mapper,
                                 FurnitureRegistry catalog, FurniturePlacementValidator placements) {
        this.projects = projects;
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.catalog = catalog;
        this.placements = placements;
    }

    @Transactional
    public View preview(String projectId, PreviewRequest request) {
        if (request == null || request.expectedRevision() == null || request.expectedRevision() < 0
                || request.commands() == null || request.commands().isEmpty() || request.commands().size() > 8) {
            throw invalid("기준 버전과 1~8개의 명령이 필요합니다.");
        }
        var project = projects.lock(projectId, request.expectedRevision());
        var next = new ArrayList<>(project.furniture());
        var actions = new ArrayList<String>();
        for (var command : request.commands()) {
            if (command == null || command.type() == null) throw invalid("명령 종류가 필요합니다.");
            if (command.type() == LayoutActionType.CLEAR) {
                if (request.commands().size() != 1) throw invalid("전체 삭제는 단독으로 요청해 주세요.");
                next.clear();
                actions.add("모든 가구 삭제");
                continue;
            }
            if (command.type() == LayoutActionType.ADD) {
                if (command.catalogId() == null || command.catalogId().length() > 100) throw invalid("가구 종류가 필요합니다.");
                var entry = catalog.require(command.catalogId());
                position(command);
                rotation(command);
                var item = new FurnitureItem(UUID.randomUUID().toString(), command.catalogId(),
                        entry.path("name").asString(), entry.path("category").asString(), command.x(), command.z(),
                        Math.floorMod(command.rotation(), 360), entry.path("color").asString());
                next.add(item);
                actions.add(item.name() + " 추가");
                continue;
            }
            var target = next.stream().filter(item -> item.id().equals(command.furnitureId())).findFirst()
                    .orElseThrow(() -> invalid("변경할 가구를 선택해 주세요."));
            int index = next.indexOf(target);
            switch (command.type()) {
                case REMOVE -> {
                    next.remove(index);
                    actions.add(target.name() + " 삭제");
                }
                case MOVE -> {
                    position(command);
                    next.set(index, new FurnitureItem(target.id(), target.catalogId(), target.name(), target.category(),
                            command.x(), command.z(), target.rotation(), target.color()));
                    actions.add(target.name() + " 이동");
                }
                case ROTATE -> {
                    rotation(command);
                    next.set(index, new FurnitureItem(target.id(), target.catalogId(), target.name(), target.category(),
                            target.x(), target.z(), Math.floorMod(command.rotation(), 360), target.color()));
                    actions.add(target.name() + " 회전");
                }
                default -> throw invalid("지원하지 않는 명령입니다.");
            }
        }
        placements.validate(project.dimensions(), project.room(), next);
        return store(project, next, actions);
    }

    // Caller already holds the project's row lock. Shared with the semantic planner's next integration.
    View store(RenovationProject project, List<FurnitureItem> furniture, List<String> actions) {
        String id = UUID.randomUUID().toString();
        Instant expires = Instant.now().plusSeconds(300);
        jdbc.update("""
                INSERT INTO layout_proposals(id, project_id, owner_id, base_revision, proposed_furniture, actions, expires_at)
                VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
                """, id, project.id(), project.ownerId(), project.revision(), mapper.writeValueAsString(furniture),
                mapper.writeValueAsString(actions), Timestamp.from(expires));
        return new View(id, "PENDING", project.revision(), expires, List.copyOf(furniture), List.copyOf(actions), null);
    }

    @Transactional
    public View status(String projectId, String proposalId) {
        var project = projects.lock(projectId, null);
        return view(load(project, proposalId), project);
    }

    @Transactional
    public View confirm(String projectId, String proposalId) {
        var project = projects.lock(projectId, null);
        var proposal = load(project, proposalId);
        var current = view(proposal, project);
        if ("APPLIED".equals(current.status())) return current;
        if (!"PENDING".equals(current.status())) throw new ResponseStatusException(CONFLICT,
                "제안을 적용할 수 없습니다: " + current.status() + ". 최신 상태에서 다시 요청해 주세요.");
        var result = projects.saveLayout(projectId, proposal.furniture(), proposal.baseRevision());
        JsonNode snapshot = mapper.valueToTree(result);
        jdbc.update("UPDATE layout_proposals SET status = 'APPLIED', result = ?::jsonb WHERE id = ?",
                snapshot.toString(), proposalId);
        return new View(proposal.id(), "APPLIED", proposal.baseRevision(), proposal.expiresAt(),
                proposal.furniture(), proposal.actions(), snapshot);
    }

    @Transactional
    public View cancel(String projectId, String proposalId) {
        var project = projects.lock(projectId, null);
        var proposal = load(project, proposalId);
        var current = view(proposal, project);
        if (!"PENDING".equals(current.status())) return current;
        jdbc.update("UPDATE layout_proposals SET status = 'CANCELLED' WHERE id = ?", proposalId);
        return new View(proposal.id(), "CANCELLED", proposal.baseRevision(), proposal.expiresAt(),
                proposal.furniture(), proposal.actions(), null);
    }

    private Stored load(RenovationProject project, String proposalId) {
        return jdbc.query("""
                SELECT id, status, base_revision, proposed_furniture::text, actions::text, expires_at, result::text
                  FROM layout_proposals WHERE id = ? AND project_id = ? AND owner_id = ? FOR UPDATE
                """, (rs, index) -> new Stored(rs.getString("id"), rs.getString("status"), rs.getLong("base_revision"),
                rs.getTimestamp("expires_at").toInstant(),
                List.of(mapper.readValue(rs.getString("proposed_furniture"), FurnitureItem[].class)),
                List.of(mapper.readValue(rs.getString("actions"), String[].class)),
                rs.getString("result") == null ? null : mapper.readTree(rs.getString("result"))),
                proposalId, project.id(), project.ownerId()).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "제안을 찾을 수 없습니다."));
    }

    private View view(Stored proposal, RenovationProject project) {
        String state = proposal.status();
        if ("PENDING".equals(state)) {
            if (!proposal.expiresAt().isAfter(Instant.now())) state = "EXPIRED";
            else if (proposal.baseRevision() != project.revision()) state = "STALE";
        }
        return new View(proposal.id(), state, proposal.baseRevision(), proposal.expiresAt(),
                proposal.furniture(), proposal.actions(), proposal.result());
    }

    private static void position(LayoutCommand command) {
        if (command.x() == null || command.z() == null || !Double.isFinite(command.x()) || !Double.isFinite(command.z())) {
            throw invalid("유효한 배치 좌표가 필요합니다.");
        }
    }

    private static void rotation(LayoutCommand command) {
        if (command.rotation() == null || command.rotation() < -360 || command.rotation() > 360) {
            throw invalid("회전은 -360도부터 360도 사이여야 합니다.");
        }
    }

    private static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(BAD_REQUEST, message);
    }
}
