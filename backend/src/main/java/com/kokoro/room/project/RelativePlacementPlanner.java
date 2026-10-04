package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.Opening;
import com.kokoro.room.project.ProjectModels.Point;
import com.kokoro.room.project.ProjectModels.RoomModel;
import com.kokoro.room.project.ProjectModels.Wall;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Deterministic "near the window" placement: candidates are the 0.1 m grid cells of the room (with the four
 * right-angle rotations for new furniture), ordered by distance to the nearest opening of the requested kind,
 * and the first one the placement validator accepts wins. Same input, same output. Nothing here saves anything.
 */
@Component
public class RelativePlacementPlanner {
    public enum AnchorKind { WINDOW, DOOR }

    public enum Proximity { NEAR, FAR_FROM }

    public record Placement(double x, double z, int rotation) {}

    private static final double STEP = 0.1;
    private static final int MAX_CELLS = 40_000;
    private static final int MAX_CHECKS = 3_000;
    private static final double[] NEW_ROTATIONS = {0, 90, 180, 270};

    private final FurniturePlacementValidator validator;

    public RelativePlacementPlanner(FurniturePlacementValidator validator) {
        this.validator = validator;
    }

    /** Places {@code count} copies of the template one after another; if any one fails, none is placed. */
    public List<Placement> placeNew(Dimensions dimensions, RoomModel room, List<FurnitureItem> existing,
                                    FurnitureItem template, int count, AnchorKind anchor, Proximity proximity) {
        List<Point> anchors = anchors(room, anchor);
        List<FurnitureItem> layout = new ArrayList<>(existing);
        List<Placement> placed = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            Placement placement = search(dimensions, room, layout, template, "planned-" + index, anchors, proximity,
                    NEW_ROTATIONS);
            placed.add(placement);
            layout.add(probe(template, "planned-" + index, placement.x(), placement.z(), placement.rotation()));
        }
        return placed;
    }

    /** Moves an existing item; its rotation stays as it is because MOVE does not change it. */
    public Placement moveExisting(Dimensions dimensions, RoomModel room, List<FurnitureItem> existing,
                                  FurnitureItem target, AnchorKind anchor, Proximity proximity) {
        List<Point> anchors = anchors(room, anchor);
        List<FurnitureItem> others = existing.stream().filter(item -> !item.id().equals(target.id())).toList();
        return search(dimensions, room, others, target, target.id(), anchors, proximity, new double[] {target.rotation()});
    }

    private Placement search(Dimensions dimensions, RoomModel room, List<FurnitureItem> layout, FurnitureItem template,
                             String probeId, List<Point> anchors, Proximity proximity, double[] rotations) {
        double width = room == null ? dimensions.width() : room.bounds().width();
        double depth = room == null ? dimensions.depth() : room.bounds().depth();
        double step = STEP;
        // ponytail: coarser grid for very large rooms so the candidate list stays bounded; 0.1 m up to ~200 m2.
        while ((width / step + 1) * (depth / step + 1) > MAX_CELLS) step += STEP;

        List<Candidate> candidates = new ArrayList<>();
        for (int ix = 0; ix * step <= width; ix++) {
            for (int iz = 0; iz * step <= depth; iz++) {
                double x = round(ix * step);
                double z = round(iz * step);
                double nearest = anchors.stream().mapToDouble(anchor -> Math.hypot(anchor.x() - x, anchor.z() - z)).min().orElse(0);
                double score = proximity == Proximity.NEAR ? nearest : -nearest;
                for (double rotation : rotations) candidates.add(new Candidate(x, z, rotation, score));
            }
        }
        candidates.sort(Comparator.comparingDouble(Candidate::score).thenComparingDouble(Candidate::z)
                .thenComparingDouble(Candidate::x).thenComparingDouble(Candidate::rotation));

        int checks = 0;
        for (Candidate candidate : candidates) {
            if (checks++ >= MAX_CHECKS) break;
            List<FurnitureItem> attempt = new ArrayList<>(layout);
            attempt.add(probe(template, probeId, candidate.x(), candidate.z(), candidate.rotation()));
            try {
                validator.validate(dimensions, room, attempt);
                return new Placement(candidate.x(), candidate.z(), (int) Math.rint(candidate.rotation()));
            } catch (FurniturePlacementException conflict) {
                // Wall, door clearance, overlap or outside the room: try the next candidate.
            }
        }
        throw new LayoutIntentException("NO_VALID_PLACEMENT", "조건에 맞는 빈 자리를 찾지 못했습니다. 배치는 바뀌지 않았습니다.");
    }

    private static List<Point> anchors(RoomModel room, AnchorKind kind) {
        List<Point> points = new ArrayList<>();
        if (room != null) {
            String type = kind == AnchorKind.WINDOW ? "window" : "door";
            for (Opening opening : room.openings()) {
                if (!type.equalsIgnoreCase(opening.type())) continue;
                room.walls().stream().filter(wall -> wall.id().equals(opening.wallId())).findFirst()
                        .ifPresent(wall -> points.add(midpoint(wall, opening)));
            }
        }
        if (points.isEmpty()) {
            String name = kind == AnchorKind.WINDOW ? "창문" : "문";
            throw new LayoutIntentException("NO_ANCHOR", "이 방에는 기준이 되는 " + name + "이 없습니다. 배치는 바뀌지 않았습니다.");
        }
        return points;
    }

    private static Point midpoint(Wall wall, Opening opening) {
        double dx = wall.b().x() - wall.a().x();
        double dz = wall.b().z() - wall.a().z();
        double length = Math.hypot(dx, dz);
        double along = (opening.from() + opening.to()) / 2;
        if (length == 0) return wall.a();
        return new Point(wall.a().x() + dx / length * along, wall.a().z() + dz / length * along);
    }

    private static FurnitureItem probe(FurnitureItem template, String id, double x, double z, double rotation) {
        return new FurnitureItem(id, template.catalogId(), template.name(), template.category(), x, z, rotation,
                template.color());
    }

    private static double round(double value) {
        return Math.round(value * 10) / 10.0;
    }

    private record Candidate(double x, double z, double rotation, double score) {}
}
