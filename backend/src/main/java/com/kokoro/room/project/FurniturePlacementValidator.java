package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.Point;
import com.kokoro.room.project.ProjectModels.RoomModel;
import com.kokoro.room.project.ProjectModels.Wall;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashSet;
import java.awt.geom.Area;
import java.awt.geom.Path2D;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Component
public class FurniturePlacementValidator {
    private static final double EPSILON = 1e-9;
    /** Product heuristic on each side of the wall, not a certified building standard. */
    public static final double DOOR_CLEARANCE_METERS = 0.8;
    private final Supplier<Map<String, FurnitureCatalog.Size>> sizes;

    /** Pure geometry tests use the same packaged contract without a database. */
    public FurniturePlacementValidator() {
        this(FurnitureCatalog.load());
    }

    public FurniturePlacementValidator(Map<String, FurnitureCatalog.Size> snapshot) {
        var fixed = Map.copyOf(snapshot);
        sizes = () -> fixed;
    }

    @org.springframework.beans.factory.annotation.Autowired
    public FurniturePlacementValidator(FurnitureRegistry registry) {
        sizes = () -> registry.items().stream().collect(Collectors.toMap(item -> item.path("id").asString(),
                item -> new FurnitureCatalog.Size(item.path("width").doubleValue(), item.path("depth").doubleValue())));
    }

    /** Candidate searches reuse one catalog snapshot instead of querying per candidate. */
    public FurniturePlacementValidator snapshot() {
        return new FurniturePlacementValidator(sizes.get());
    }

    /** Existing placements are checked by the caller once, not for every search candidate. */
    public void validateCandidate(Dimensions dimensions, RoomModel room, List<FurnitureItem> existing, FurnitureItem candidate) {
        validate(dimensions, room, List.of(candidate));
        var catalog = sizes.get();
        var footprint = box(candidate, catalog);
        for (var other : existing) {
            if (overlaps(footprint, box(other, catalog))) throw new InvalidPlacementException("FURNITURE_OVERLAP",
                    "가구가 겹칩니다.", List.of(candidate.id(), other.id()), null, null);
        }
    }

    /**
     * Coordinates are meters with the origin at the top-left of the room bounding box.
     * Without room data the room is treated as a rectangle of the project dimensions.
     */
    public void validate(Dimensions dimensions, RoomModel room, List<FurnitureItem> furniture) {
        if (furniture == null || furniture.size() > 200) throw invalid("가구는 최대 200개입니다.");
        var ids = new HashSet<String>();
        for (var item : furniture) {
            if (item == null || item.id() == null || item.id().isBlank()) throw invalid("가구 식별자가 필요합니다.");
            if (!ids.add(item.id())) throw new InvalidPlacementException("DUPLICATE_FURNITURE_ID",
                    "가구 식별자가 중복됩니다.", List.of(item.id()), null, null);
        }
        List<Point> outline = outline(dimensions, room);
        var catalog = sizes.get();
        List<OrientedBox> boxes = furniture.stream().map(item -> box(item, catalog)).toList();
        for (int index = 0; index < boxes.size(); index++) {
            if (!insideRoom(outline, boxes.get(index))) {
                throw new InvalidPlacementException("OUTSIDE_ROOM", "가구 '" + furniture.get(index).name()
                        + "'가 방 경계를 벗어났습니다.", List.of(furniture.get(index).id()), null, null);
            }
            if (room != null) validateWalls(room, boxes.get(index), furniture.get(index));
            for (int other = index + 1; other < boxes.size(); other++) {
                if (overlaps(boxes.get(index), boxes.get(other))) {
                    throw new InvalidPlacementException("FURNITURE_OVERLAP", "가구 '" + furniture.get(index).name()
                            + "'와 '" + furniture.get(other).name() + "'가 겹칩니다.",
                            List.of(furniture.get(index).id(), furniture.get(other).id()), null, null);
                }
            }
        }
    }

    private List<Point> outline(Dimensions dimensions, RoomModel room) {
        if (room != null && room.outline() != null && room.outline().size() >= 3) return room.outline();
        double width = room == null ? dimensions.width() : room.bounds().width();
        double depth = room == null ? dimensions.depth() : room.bounds().depth();
        return List.of(new Point(0, 0), new Point(width, 0), new Point(width, depth), new Point(0, depth));
    }

    private OrientedBox box(FurnitureItem item, Map<String, FurnitureCatalog.Size> catalog) {
        if (item.catalogId() == null) throw invalid("가구 카탈로그 식별자가 필요합니다.");
        FurnitureCatalog.Size size = catalog.get(item.catalogId());
        if (size == null) throw invalid("지원하지 않는 가구입니다: " + item.catalogId());
        if (item.x() == null || item.z() == null || !Double.isFinite(item.x()) || !Double.isFinite(item.z())) {
            throw invalid("가구 위치 값이 올바르지 않습니다.");
        }
        if (item.rotation() == null) throw invalid("가구 회전 값이 올바르지 않습니다.");
        double radians = Math.toRadians(item.rotation());
        double cos = Math.cos(radians);
        double sin = Math.sin(radians);
        return new OrientedBox(
                item.x(),
                item.z(),
                new Axis(cos, sin),
                new Axis(-sin, cos),
                size.width() / 2,
                size.depth() / 2
        );
    }

    /** Test the whole footprint, including edges across a concave notch. */
    private boolean insideRoom(List<Point> outline, OrientedBox box) {
        for (Point corner : corners(box)) {
            if (!contains(outline, corner)) return false;
        }
        // Ignore sub-micrometer round-off at a touching boundary, not positive-area overlap.
        OrientedBox inset = new OrientedBox(box.centerX(), box.centerZ(), box.axisX(), box.axisZ(),
                Math.max(0, box.halfWidth() - 1e-7), Math.max(0, box.halfDepth() - 1e-7));
        Area outside = new Area(path(corners(inset)));
        outside.subtract(new Area(path(outline)));
        return outside.isEmpty();
    }

    private List<Point> corners(OrientedBox box) {
        List<Point> corners = new ArrayList<>(4);
        // Perimeter order is required for polygon subtraction (not a bow-tie).
        for (int[] sign : new int[][] { {-1, -1}, {1, -1}, {1, 1}, {-1, 1} }) {
                int signX = sign[0], signZ = sign[1];
                corners.add(new Point(
                        box.centerX() + box.axisX().x() * box.halfWidth() * signX + box.axisZ().x() * box.halfDepth() * signZ,
                        box.centerZ() + box.axisX().z() * box.halfWidth() * signX + box.axisZ().z() * box.halfDepth() * signZ));
        }
        return corners;
    }

    private static Path2D path(List<Point> points) {
        var path = new Path2D.Double();
        path.moveTo(points.get(0).x(), points.get(0).z());
        for (int index = 1; index < points.size(); index++) path.lineTo(points.get(index).x(), points.get(index).z());
        path.closePath();
        return path;
    }

    private void validateWalls(RoomModel room, OrientedBox box, FurnitureItem item) {
        for (Wall wall : room.walls()) {
            double length = Math.hypot(wall.b().x() - wall.a().x(), wall.b().z() - wall.a().z());
            Axis axis = new Axis((wall.b().x() - wall.a().x()) / length, (wall.b().z() - wall.a().z()) / length);
            Axis normal = new Axis(-axis.z(), axis.x());
            var wallBox = new OrientedBox((wall.a().x() + wall.b().x()) / 2,
                    (wall.a().z() + wall.b().z()) / 2, axis, normal, length / 2, wall.thickness() / 2);
            if (overlaps(box, wallBox)) {
                throw new InvalidPlacementException("WALL_COLLISION", "가구가 벽을 가로지릅니다.",
                        List.of(item.id()), wall.id(), null);
            }
            for (var opening : room.openings()) {
                if (!"door".equals(opening.type()) || !wall.id().equals(opening.wallId())) continue;
                double middle = (opening.from() + opening.to()) / 2;
                var clearance = new OrientedBox(wall.a().x() + axis.x() * middle,
                        wall.a().z() + axis.z() * middle, axis, normal,
                        (opening.to() - opening.from()) / 2, wall.thickness() / 2 + DOOR_CLEARANCE_METERS);
                if (overlaps(box, clearance)) {
                    throw new InvalidPlacementException("DOOR_CLEARANCE", "가구가 문 앞 여유 공간을 막습니다.",
                            List.of(item.id()), wall.id(), opening.id());
                }
            }
        }
    }

    /** Ray casting. Points on an edge count as inside so a flush placement is allowed. */
    private boolean contains(List<Point> polygon, Point point) {
        double tolerance = 1e-6;
        boolean inside = false;
        for (int i = 0, j = polygon.size() - 1; i < polygon.size(); j = i++) {
            Point current = polygon.get(i);
            Point previous = polygon.get(j);
            if (onSegment(point, previous, current, tolerance)) return true;
            boolean crosses = (current.z() > point.z()) != (previous.z() > point.z())
                    && point.x() < (previous.x() - current.x()) * (point.z() - current.z())
                    / (previous.z() - current.z()) + current.x();
            if (crosses) inside = !inside;
        }
        return inside;
    }

    private boolean onSegment(Point point, Point start, Point end, double tolerance) {
        double cross = (end.x() - start.x()) * (point.z() - start.z()) - (end.z() - start.z()) * (point.x() - start.x());
        double length = Math.hypot(end.x() - start.x(), end.z() - start.z());
        if (length == 0) return Math.hypot(point.x() - start.x(), point.z() - start.z()) <= tolerance;
        if (Math.abs(cross) / length > tolerance) return false;
        double dot = (point.x() - start.x()) * (end.x() - start.x()) + (point.z() - start.z()) * (end.z() - start.z());
        return dot >= -tolerance && dot <= length * length + tolerance;
    }

    /** Separating Axis Theorem. Touching edges are allowed; only positive overlap is rejected. */
    private boolean overlaps(OrientedBox first, OrientedBox second) {
        Axis[] axes = { first.axisX(), first.axisZ(), second.axisX(), second.axisZ() };
        for (Axis axis : axes) {
            double distance = Math.abs((second.centerX() - first.centerX()) * axis.x()
                    + (second.centerZ() - first.centerZ()) * axis.z());
            double firstRadius = projection(first, axis);
            double secondRadius = projection(second, axis);
            if (distance >= firstRadius + secondRadius - EPSILON) return false;
        }
        return true;
    }

    private double projection(OrientedBox box, Axis axis) {
        return Math.abs(box.axisX().x() * axis.x() + box.axisX().z() * axis.z()) * box.halfWidth()
                + Math.abs(box.axisZ().x() * axis.x() + box.axisZ().z() * axis.z()) * box.halfDepth();
    }

    private static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(BAD_REQUEST, message);
    }

    private record Axis(double x, double z) {}
    private record OrientedBox(double centerX, double centerZ, Axis axisX, Axis axisZ,
                               double halfWidth, double halfDepth) {}
}
