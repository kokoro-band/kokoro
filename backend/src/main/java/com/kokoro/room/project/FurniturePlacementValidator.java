package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.Opening;
import com.kokoro.room.project.ProjectModels.Point;
import com.kokoro.room.project.ProjectModels.RoomModel;
import com.kokoro.room.project.ProjectModels.Wall;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Component
public class FurniturePlacementValidator {
    private static final double EPSILON = 1e-9;
    /**
     * ponytail: product heuristic, not a walking-clearance or building-code figure.
     * Width in meters kept clear on each side of a door opening, in front of the door.
     */
    private static final double DOOR_CLEARANCE = 0.8;
    private static final Map<String, FurnitureCatalog.Size> CATALOG = FurnitureCatalog.load();

    /**
     * Coordinates are meters with the origin at the top-left of the room bounding box.
     * Without room data the room is treated as a rectangle of the project dimensions.
     */
    public void validate(Dimensions dimensions, RoomModel room, List<FurnitureItem> furniture) {
        ProjectInputLimits.furniture(furniture);
        checkDuplicateIds(furniture);
        List<Point> outline = outline(dimensions, room);
        List<OrientedBox> boxes = furniture.stream().map(this::box).toList();
        List<OrientedBox> wallRects = room == null ? List.of() : room.walls().stream().map(this::wallBox).toList();
        List<OrientedBox> doorRects = room == null ? List.of()
                : room.openings().stream()
                        .filter(opening -> "door".equalsIgnoreCase(opening.type()))
                        .map(opening -> doorClearanceBox(opening, room, outline))
                        .toList();

        for (int index = 0; index < boxes.size(); index++) {
            FurnitureItem item = furniture.get(index);
            OrientedBox box = boxes.get(index);
            if (!insideRoom(outline, box)) {
                throw outsideRoom(item);
            }
            for (int w = 0; room != null && w < room.walls().size(); w++) {
                if (overlaps(box, wallRects.get(w))) {
                    throw wallCollision(item, room.walls().get(w));
                }
            }
            for (int d = 0, o = 0; room != null && o < room.openings().size(); o++) {
                Opening opening = room.openings().get(o);
                if (!"door".equalsIgnoreCase(opening.type())) continue;
                if (overlaps(box, doorRects.get(d++))) {
                    throw doorClearance(item, opening);
                }
            }
            for (int other = index + 1; other < boxes.size(); other++) {
                if (overlaps(box, boxes.get(other))) {
                    throw furnitureOverlap(item, furniture.get(other));
                }
            }
        }
    }

    /** Manual drafts may need placement repairs, but must still contain usable furniture data. */
    public void validateData(List<FurnitureItem> furniture) {
        ProjectInputLimits.furniture(furniture);
        checkDuplicateIds(furniture);
        furniture.forEach(this::box);
    }

    private void checkDuplicateIds(List<FurnitureItem> furniture) {
        Set<String> seen = new HashSet<>();
        for (FurnitureItem item : furniture) {
            if (!seen.add(item.id())) throw invalid("가구 id가 중복되었습니다: " + item.id());
        }
    }

    private List<Point> outline(Dimensions dimensions, RoomModel room) {
        if (room != null && room.outline() != null && room.outline().size() >= 3) return room.outline();
        double width = room == null ? dimensions.width() : room.bounds().width();
        double depth = room == null ? dimensions.depth() : room.bounds().depth();
        return List.of(new Point(0, 0), new Point(width, 0), new Point(width, depth), new Point(0, depth));
    }

    private OrientedBox box(FurnitureItem item) {
        FurnitureCatalog.Size size = CATALOG.get(item.catalogId());
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

    /** Thick rectangle spanning the wall segment, used for both crossing and SAT overlap checks. */
    private OrientedBox wallBox(Wall wall) {
        double dx = wall.b().x() - wall.a().x();
        double dz = wall.b().z() - wall.a().z();
        double length = Math.hypot(dx, dz);
        Axis axisX = length == 0 ? new Axis(1, 0) : new Axis(dx / length, dz / length);
        Axis axisZ = new Axis(-axisX.z(), axisX.x());
        return new OrientedBox(
                (wall.a().x() + wall.b().x()) / 2,
                (wall.a().z() + wall.b().z()) / 2,
                axisX, axisZ,
                length / 2,
                wall.thickness() / 2
        );
    }

    /** Rectangle covering the door span plus DOOR_CLEARANCE on each side, extending into the room. */
    private OrientedBox doorClearanceBox(Opening opening, RoomModel room, List<Point> outline) {
        Wall wall = room.walls().stream().filter(w -> w.id().equals(opening.wallId())).findFirst()
                .orElseThrow(() -> invalid("문의 벽을 찾을 수 없습니다: " + opening.wallId()));
        double dx = wall.b().x() - wall.a().x();
        double dz = wall.b().z() - wall.a().z();
        double length = Math.hypot(dx, dz);
        Axis axisX = length == 0 ? new Axis(1, 0) : new Axis(dx / length, dz / length);
        Axis normal = new Axis(-axisX.z(), axisX.x());

        double mid = (opening.from() + opening.to()) / 2;
        double midX = wall.a().x() + axisX.x() * mid;
        double midZ = wall.a().z() + axisX.z() * mid;

        Point centroid = centroid(outline);
        double towardInterior = (centroid.x() - midX) * normal.x() + (centroid.z() - midZ) * normal.z();
        if (towardInterior < 0) normal = new Axis(-normal.x(), -normal.z());

        double span = Math.abs(opening.to() - opening.from());
        return new OrientedBox(
                midX + normal.x() * DOOR_CLEARANCE / 2,
                midZ + normal.z() * DOOR_CLEARANCE / 2,
                axisX, normal,
                span / 2 + DOOR_CLEARANCE,
                DOOR_CLEARANCE / 2
        );
    }

    private static Point centroid(List<Point> polygon) {
        double x = 0;
        double z = 0;
        for (Point point : polygon) {
            x += point.x();
            z += point.z();
        }
        return new Point(x / polygon.size(), z / polygon.size());
    }

    /**
     * The rotated footprint must lie entirely inside the floor polygon: every corner inside,
     * and no edge crossing an outline edge (catches a concave notch even when all four
     * corners happen to land in the filled part of the polygon).
     */
    private boolean insideRoom(List<Point> outline, OrientedBox box) {
        List<Point> corners = corners(box);
        for (Point corner : corners) {
            if (!contains(outline, corner)) return false;
        }
        for (int i = 0; i < corners.size(); i++) {
            Point boxStart = corners.get(i);
            Point boxEnd = corners.get((i + 1) % corners.size());
            for (int j = 0; j < outline.size(); j++) {
                Point outlineStart = outline.get(j);
                Point outlineEnd = outline.get((j + 1) % outline.size());
                if (segmentsCross(boxStart, boxEnd, outlineStart, outlineEnd)) return false;
            }
        }
        return true;
    }

    /** Corners in cyclic (winding) order so consecutive pairs form the footprint's edges. */
    private List<Point> corners(OrientedBox box) {
        double[] signsX = { -1, 1, 1, -1 };
        double[] signsZ = { -1, -1, 1, 1 };
        List<Point> corners = new ArrayList<>(4);
        for (int i = 0; i < 4; i++) {
            corners.add(new Point(
                    box.centerX() + box.axisX().x() * box.halfWidth() * signsX[i] + box.axisZ().x() * box.halfDepth() * signsZ[i],
                    box.centerZ() + box.axisX().z() * box.halfWidth() * signsX[i] + box.axisZ().z() * box.halfDepth() * signsZ[i]));
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

    /** Proper segment crossing only; shared endpoints or a flush touch are not a crossing. */
    private boolean segmentsCross(Point a1, Point a2, Point b1, Point b2) {
        double tolerance = 1e-9;
        double d1 = cross(b1, b2, a1);
        double d2 = cross(b1, b2, a2);
        double d3 = cross(a1, a2, b1);
        double d4 = cross(a1, a2, b2);
        boolean straddlesB = (d1 > tolerance && d2 < -tolerance) || (d1 < -tolerance && d2 > tolerance);
        boolean straddlesA = (d3 > tolerance && d4 < -tolerance) || (d3 < -tolerance && d4 > tolerance);
        return straddlesB && straddlesA;
    }

    private static double cross(Point origin, Point a, Point b) {
        return (a.x() - origin.x()) * (b.z() - origin.z()) - (a.z() - origin.z()) * (b.x() - origin.x());
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

    private static FurniturePlacementException outsideRoom(FurnitureItem item) {
        return new FurniturePlacementException("OUTSIDE_ROOM",
                "가구 '" + item.name() + "'가 방 경계를 벗어났습니다.", List.of(item.id()), null, null);
    }

    private static FurniturePlacementException wallCollision(FurnitureItem item, Wall wall) {
        return new FurniturePlacementException("WALL_COLLISION",
                "가구 '" + item.name() + "'가 벽을 가로지릅니다.", List.of(item.id()), wall.id(), null);
    }

    private static FurniturePlacementException doorClearance(FurnitureItem item, Opening opening) {
        return new FurniturePlacementException("DOOR_CLEARANCE",
                "가구 '" + item.name() + "'가 문 앞 여유 구역을 침범합니다.", List.of(item.id()), null, opening.id());
    }

    private static FurniturePlacementException furnitureOverlap(FurnitureItem first, FurnitureItem second) {
        return new FurniturePlacementException("FURNITURE_OVERLAP",
                "가구 '" + first.name() + "'와 '" + second.name() + "'가 겹칩니다.",
                List.of(first.id(), second.id()), null, null);
    }

    private record Axis(double x, double z) {}
    private record OrientedBox(double centerX, double centerZ, Axis axisX, Axis axisZ,
                               double halfWidth, double halfDepth) {}
}
