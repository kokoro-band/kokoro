package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.Point;
import com.kokoro.room.project.ProjectModels.RoomModel;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Component
public class FurniturePlacementValidator {
    private static final double EPSILON = 1e-9;
    private final java.util.function.Function<String, FurnitureCatalog.Size> sizeOf;

    /** Pure geometry tests use the same packaged contract without a database. */
    public FurniturePlacementValidator() {
        Map<String, FurnitureCatalog.Size> sizes = FurnitureCatalog.load();
        sizeOf = sizes::get;
    }

    @org.springframework.beans.factory.annotation.Autowired
    public FurniturePlacementValidator(FurnitureRegistry registry) {
        sizeOf = id -> {
            var item = registry.require(id);
            return new FurnitureCatalog.Size(item.path("width").doubleValue(), item.path("depth").doubleValue());
        };
    }

    /**
     * Coordinates are meters with the origin at the top-left of the room bounding box.
     * Without room data the room is treated as a rectangle of the project dimensions.
     */
    public void validate(Dimensions dimensions, RoomModel room, List<FurnitureItem> furniture) {
        List<Point> outline = outline(dimensions, room);
        List<OrientedBox> boxes = furniture.stream().map(this::box).toList();
        for (int index = 0; index < boxes.size(); index++) {
            if (!insideRoom(outline, boxes.get(index))) {
                throw invalid("가구 '" + furniture.get(index).name() + "'가 방 경계를 벗어났습니다.");
            }
            for (int other = index + 1; other < boxes.size(); other++) {
                if (overlaps(boxes.get(index), boxes.get(other))) {
                    throw invalid("가구 '" + furniture.get(index).name() + "'와 '" + furniture.get(other).name() + "'가 겹칩니다.");
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

    private OrientedBox box(FurnitureItem item) {
        FurnitureCatalog.Size size = sizeOf.apply(item.catalogId());
        if (size == null) throw invalid("지원하지 않는 가구입니다: " + item.catalogId());
        if (!Double.isFinite(item.x()) || !Double.isFinite(item.z())) {
            throw invalid("가구 위치 값이 올바르지 않습니다.");
        }
        if (!Double.isFinite(item.rotation())) throw invalid("가구 회전 값이 올바르지 않습니다.");
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

    /** Every corner of the rotated footprint must lie inside the floor polygon. */
    private boolean insideRoom(List<Point> outline, OrientedBox box) {
        for (Point corner : corners(box)) {
            if (!contains(outline, corner)) return false;
        }
        return true;
    }

    private List<Point> corners(OrientedBox box) {
        List<Point> corners = new ArrayList<>(4);
        for (int signX = -1; signX <= 1; signX += 2) {
            for (int signZ = -1; signZ <= 1; signZ += 2) {
                corners.add(new Point(
                        box.centerX() + box.axisX().x() * box.halfWidth() * signX + box.axisZ().x() * box.halfDepth() * signZ,
                        box.centerZ() + box.axisX().z() * box.halfWidth() * signX + box.axisZ().z() * box.halfDepth() * signZ));
            }
        }
        return corners;
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
