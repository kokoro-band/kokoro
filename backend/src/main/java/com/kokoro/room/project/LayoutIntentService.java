package com.kokoro.room.project;

import com.kokoro.room.project.LayoutIntent.*;
import com.kokoro.room.project.ProjectModels.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Service
public class LayoutIntentService {
    public record Request(@NotNull @PositiveOrZero Long expectedRevision, @NotNull JsonNode intent,
                          @Size(max = 100) String selectedFurnitureId, @Size(max = 16) Map<String, String> choices,
                          @Size(max = 80) String focusRoomName) {}
    private record Offset(double x, double z) {}
    private static final List<Offset> SEARCH_OFFSETS = offsets();
    private final ProjectService projects;
    private final LayoutProposalService proposals;
    private final FurnitureRegistry registry;

    public LayoutIntentService(ProjectService projects, LayoutProposalService proposals, FurnitureRegistry registry) {
        this.projects = projects;
        this.proposals = proposals;
        this.registry = registry;
    }

    @Transactional
    public LayoutProposalService.View preview(String projectId, Request request) {
        var intent = LayoutIntent.parse(request.intent());
        if (request.expectedRevision() == null || request.expectedRevision() < 0) throw invalid("프로젝트 버전이 필요합니다.");
        var project = projects.lock(projectId, request.expectedRevision());
        var entries = registry.items().stream().collect(Collectors.toMap(n -> n.path("id").asString(), n -> n));
        var sizes = entries.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey,
                e -> new FurnitureCatalog.Size(e.getValue().path("width").doubleValue(), e.getValue().path("depth").doubleValue())));
        var validator = new FurniturePlacementValidator(sizes);
        var choices = request.choices() == null ? Map.<String, String>of() : request.choices();
        for (var choice : choices.entrySet()) {
            if (!choice.getKey().matches("[0-7]:(target|anchor)") || choice.getValue() == null
                    || choice.getValue().length() > 128) throw invalid("대상 선택 형식이 올바르지 않습니다.");
        }
        RoomModel placementRoom = focusRoom(project, request.focusRoomName());
        var next = new ArrayList<>(project.furniture());
        var actions = new ArrayList<String>();
        for (int index = 0; index < intent.commands().size(); index++) {
            var command = intent.commands().get(index);
            String key = index + ":target";
            if (command.action() == Action.CLEAR) {
                next.clear();
                actions.add("프로젝트의 모든 가구 삭제");
                continue;
            }
            if (command.action() == Action.ADD) {
                var entry = entries.get(command.catalogId());
                if (entry == null) throw invalid("서버 카탈로그에 없는 가구입니다.");
                for (int count = 0; count < command.count(); count++) {
                    // Choice retries replay the same batch, including instances not saved yet.
                    String seed = project.id() + ":" + project.revision() + ":" + intent.commands() + ":" + index + ":" + count;
                    String temporaryId = UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8)).toString();
                    var item = new FurnitureItem(temporaryId, command.catalogId(), entry.path("name").asString(),
                            entry.path("category").asString(), 0.0, 0.0, Math.floorMod(command.rotation(), 360), entry.path("color").asString());
                    next.add(place(project, placementRoom, item, command, next, index, request.selectedFurnitureId(), choices, sizes, validator));
                    if (next.size() > 200) throw invalid("가구는 최대 200개입니다.");
                }
                actions.add(entry.path("name").asString() + " " + command.count() + "개 추가");
                continue;
            }
            var target = target(next, command.targetQuery(), request.selectedFurnitureId(), key, choices);
            int at = next.indexOf(target);
            if (command.action() == Action.REMOVE) {
                next.remove(at);
                actions.add(target.name() + " 삭제");
            } else if (command.action() == Action.ROTATE) {
                next.set(at, itemAt(target, target.x(), target.z(), command.rotation()));
                actions.add(target.name() + " " + command.rotation() + "도로 회전");
            } else {
                var others = new ArrayList<>(next);
                others.remove(at);
                var moved = place(project, placementRoom, target, command, others, index, request.selectedFurnitureId(), choices, sizes, validator);
                next.set(at, moved);
                actions.add(target.name() + " 이동");
            }
        }
        // All or nothing, including changes made after a candidate was first checked.
        validator.validate(project.dimensions(), project.room(), next);
        return proposals.store(project, next, actions);
    }

    private FurnitureItem place(RenovationProject project, RoomModel placementRoom, FurnitureItem item,
                                Command command, List<FurnitureItem> others, int index, String selectedId,
                                Map<String, String> choices, Map<String, FurnitureCatalog.Size> sizes,
                                FurniturePlacementValidator validator) {
        var relation = command.placement();
        if (relation.name().startsWith("OFFSET_")) {
            double x = item.x(), z = item.z();
            switch (relation) {
                case OFFSET_LEFT -> x -= command.distanceM();
                case OFFSET_RIGHT -> x += command.distanceM();
                case OFFSET_FRONT -> z += command.distanceM();
                case OFFSET_BACK -> z -= command.distanceM();
                default -> throw invalid("잘못된 이동 방향입니다.");
            }
            var moved = itemAt(item, x, z, item.rotation());
            validator.validateCandidate(project.dimensions(), placementRoom, others, moved);
            return moved;
        }
        double width = project.room() == null ? project.dimensions().width() : project.room().bounds().width();
        double depth = project.room() == null ? project.dimensions().depth() : project.room().bounds().depth();
        double minX = 0, minZ = 0, maxX = width, maxZ = depth;
        double x = width / 2, z = depth / 2;
        if (placementRoom != null) {
            minX = placementRoom.outline().stream().mapToDouble(Point::x).min().orElse(0);
            minZ = placementRoom.outline().stream().mapToDouble(Point::z).min().orElse(0);
            maxX = placementRoom.outline().stream().mapToDouble(Point::x).max().orElse(width);
            maxZ = placementRoom.outline().stream().mapToDouble(Point::z).max().orElse(depth);
            x = placementRoom.outline().stream().mapToDouble(Point::x).average().orElse(x);
            z = placementRoom.outline().stream().mapToDouble(Point::z).average().orElse(z);
        }
        FurnitureItem anchor = null;
        double gap = command.distanceM() > 0 ? command.distanceM() : 0.2;
        if (command.anchorQuery() != null && !command.anchorQuery().isBlank()) {
            anchor = target(others, command.anchorQuery(), selectedId, index + ":anchor", choices);
            double dx = halfExtent(anchor, sizes, true) + halfExtent(item, sizes, true) + gap;
            double dz = halfExtent(anchor, sizes, false) + halfExtent(item, sizes, false) + gap;
            x = anchor.x(); z = anchor.z();
            switch (relation) {
                case LEFT -> x -= dx;
                case RIGHT -> x += dx;
                case FRONT -> z += dz;
                case BACK -> z -= dz;
                default -> throw invalid("기준 가구의 왼쪽이나 오른쪽 또는 앞뒤를 알려 주세요.");
            }
        } else if (relation == Placement.NEAR_WINDOW || relation == Placement.NEAR_DOOR) {
            var location = opening(project.room(), relation == Placement.NEAR_WINDOW ? "window" : "door", index + ":anchor", choices);
            x = location.x(); z = location.z();
        } else {
            double halfX = halfExtent(item, sizes, true), halfZ = halfExtent(item, sizes, false);
            switch (relation) {
                case LEFT -> x = minX + halfX + gap;
                case RIGHT -> x = maxX - halfX - gap;
                case FRONT -> z = maxZ - halfZ - gap;
                case BACK -> z = minZ + halfZ + gap;
                default -> { }
            }
        }
        int checked = 0;
        for (var offset : SEARCH_OFFSETS) {
            var candidate = itemAt(item, x + offset.x(), z + offset.z(), item.rotation());
            if (candidate.x() < 0 || candidate.z() < 0 || candidate.x() > width || candidate.z() > depth) continue;
            if (anchor != null && !onSide(candidate, anchor, relation, gap, sizes)) continue;
            if ((relation == Placement.NEAR_WINDOW || relation == Placement.NEAR_DOOR)
                    && Math.hypot(offset.x(), offset.z()) > 2) continue;
            if (++checked > 1200) break;
            try {
                validator.validateCandidate(project.dimensions(), placementRoom, others, candidate);
                return candidate;
            } catch (InvalidPlacementException ignored) {
                // Geometry rejection advances a bounded search. Invalid catalog/data errors must propagate.
            }
        }
        throw new LayoutChoiceException("NO_VALID_PLACEMENT", "요청한 위치 근처의 탐색 범위에서 안전한 배치를 찾지 못했습니다. 다른 위치를 요청해 주세요.", null, List.of());
    }

    private static FurnitureItem target(List<FurnitureItem> items, String query, String selectedId,
                                         String key, Map<String, String> choices) {
        String normalized = normalize(query);
        List<FurnitureItem> matches;
        if (normalized.contains("선택")) {
            matches = selectedId == null ? items : items.stream().filter(item -> item.id().equals(selectedId)).toList();
        } else {
            matches = items.stream().filter(item -> !normalized.isBlank() &&
                    (normalize(item.name()).contains(normalized) || normalize(item.category()).equals(normalized)
                            || item.id().equals(query) || item.catalogId().equals(query)
                            || (normalized.equals("식물") && item.name().contains("화분")))) .toList();
        }
        String chosen = choices.get(key);
        if (chosen != null) return matches.stream().filter(item -> item.id().equals(chosen)).findFirst()
                .orElseThrow(() -> invalid("선택한 가구가 요청 대상에 없습니다. 다시 요청해 주세요."));
        if (matches.size() == 1 && !(normalized.contains("선택") && selectedId == null)) return matches.get(0);
        if (matches.isEmpty()) throw new LayoutChoiceException("NO_TARGET", "요청한 가구를 찾지 못했습니다. 가구 이름을 확인해 주세요.", key, List.of());
        throw new LayoutChoiceException("AMBIGUOUS_TARGET", "어떤 가구를 뜻하는지 선택해 주세요.", key,
                matches.stream().map(item -> new LayoutChoiceException.Candidate(item.id(), item.name()
                        + " (" + round(item.x()) + "m, " + round(item.z()) + "m)" )).toList());
    }

    private static Point opening(RoomModel room, String type, String key, Map<String, String> choices) {
        var candidates = room == null ? List.<Opening>of() : room.openings().stream().filter(o -> type.equals(o.type())).toList();
        if (candidates.isEmpty()) throw new LayoutChoiceException("NO_ANCHOR", type.equals("window")
                ? "공간에 창문이 없습니다. 구조 화면에서 창문을 추가해 주세요." : "공간에 문이 없습니다. 구조 화면에서 문을 추가해 주세요.", key, List.of());
        Opening chosen;
        if (choices.containsKey(key)) chosen = candidates.stream().filter(o -> o.id().equals(choices.get(key))).findFirst()
                .orElseThrow(() -> invalid("선택한 문이나 창문이 없습니다."));
        else if (candidates.size() == 1) chosen = candidates.get(0);
        else throw new LayoutChoiceException("AMBIGUOUS_ANCHOR", "기준으로 사용할 문이나 창문을 선택해 주세요.", key,
                    candidates.stream().map(o -> new LayoutChoiceException.Candidate(o.id(), (type.equals("window") ? "창문 " : "문 ") + o.id())).toList());
        var wall = room.walls().stream().filter(w -> w.id().equals(chosen.wallId())).findFirst().orElseThrow(() -> invalid("문이나 창문의 벽이 없습니다."));
        double length = Math.hypot(wall.b().x() - wall.a().x(), wall.b().z() - wall.a().z());
        double ratio = (chosen.from() + chosen.to()) / 2 / length;
        return new Point(wall.a().x() + (wall.b().x() - wall.a().x()) * ratio,
                wall.a().z() + (wall.b().z() - wall.a().z()) * ratio);
    }

    private static RoomModel focusRoom(RenovationProject project, String name) {
        var room = project.room();
        if (name == null) return room;
        var candidates = room == null || room.rooms() == null ? List.<RoomLabel>of()
                : room.rooms().stream().filter(label -> name.equals(label.name())).toList();
        if (candidates.size() != 1) throw invalid("선택한 방이 변경되었습니다. 집 전체에서 다시 요청해 주세요.");
        return new RoomModel(room.version(), room.unit(), room.wallHeight(), room.bounds(), candidates.get(0).polygon(),
                room.walls(), room.openings(), room.rooms(), room.spawn(), room.source());
    }

    private static boolean onSide(FurnitureItem item, FurnitureItem anchor, Placement side, double gap,
                                   Map<String, FurnitureCatalog.Size> sizes) {
        double dx = halfExtent(item, sizes, true) + halfExtent(anchor, sizes, true) + gap;
        double dz = halfExtent(item, sizes, false) + halfExtent(anchor, sizes, false) + gap;
        return switch (side) {
            case LEFT -> item.x() <= anchor.x() - dx + 1e-7;
            case RIGHT -> item.x() >= anchor.x() + dx - 1e-7;
            case FRONT -> item.z() >= anchor.z() + dz - 1e-7;
            case BACK -> item.z() <= anchor.z() - dz + 1e-7;
            default -> false;
        };
    }
    private static double halfExtent(FurnitureItem item, Map<String, FurnitureCatalog.Size> sizes, boolean x) {
        var size = sizes.get(item.catalogId());
        if (size == null) throw invalid("카탈로그에 없는 가구가 배치되어 있습니다.");
        double cos = Math.abs(Math.cos(Math.toRadians(item.rotation()))), sin = Math.abs(Math.sin(Math.toRadians(item.rotation())));
        return x ? (size.width() * cos + size.depth() * sin) / 2 : (size.width() * sin + size.depth() * cos) / 2;
    }
    private static FurnitureItem itemAt(FurnitureItem item, double x, double z, int rotation) {
        return new FurnitureItem(item.id(), item.catalogId(), item.name(), item.category(), round(x), round(z), Math.floorMod(rotation, 360), item.color());
    }
    private static double round(double value) { return Math.round(value * 10000) / 10000.0; }
    private static String normalize(String text) { return text == null ? "" : text.replaceAll("\\s+", "").toLowerCase(Locale.ROOT); }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(BAD_REQUEST, message); }
    private static List<Offset> offsets() {
        var result = new ArrayList<Offset>();
        for (int x = -30; x <= 30; x++) for (int z = -30; z <= 30; z++) result.add(new Offset(x / 10.0, z / 10.0));
        result.sort(Comparator.comparingDouble((Offset o) -> o.x() * o.x() + o.z() * o.z()).thenComparingDouble(Offset::x).thenComparingDouble(Offset::z));
        return List.copyOf(result);
    }
}
