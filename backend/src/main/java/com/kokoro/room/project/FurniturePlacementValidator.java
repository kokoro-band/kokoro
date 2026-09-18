package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Component
public class FurniturePlacementValidator {
    private static final double EPSILON = 1e-9;
    private static final Map<String, FurnitureSize> CATALOG = Map.of(
            "sofa-cloud", new FurnitureSize(2.2, 0.92),
            "sofa-moss", new FurnitureSize(2.1, 0.95),
            "table-oak", new FurnitureSize(1.25, 0.7),
            "table-white", new FurnitureSize(1.0, 1.0),
            "chair-shell", new FurnitureSize(0.65, 0.65),
            "chair-sand", new FurnitureSize(0.65, 0.65),
            "plant-olive", new FurnitureSize(0.55, 0.55),
            "lamp-arc", new FurnitureSize(0.5, 0.5)
    );

    public void validate(Dimensions room, List<FurnitureItem> furniture) {
        List<OrientedBox> boxes = furniture.stream().map(item -> box(room, item)).toList();
        for (int index = 0; index < boxes.size(); index++) {
            if (!insideRoom(room, boxes.get(index))) {
                throw invalid("가구 '" + furniture.get(index).name() + "'가 방 경계를 벗어났습니다.");
            }
            for (int other = index + 1; other < boxes.size(); other++) {
                if (overlaps(boxes.get(index), boxes.get(other))) {
                    throw invalid("가구 '" + furniture.get(index).name() + "'와 '" + furniture.get(other).name() + "'가 겹칩니다.");
                }
            }
        }
    }

    private OrientedBox box(Dimensions room, FurnitureItem item) {
        FurnitureSize size = CATALOG.get(item.catalogId());
        if (size == null) throw invalid("지원하지 않는 가구입니다: " + item.catalogId());
        if (item.x() < 0 || item.x() > 100 || item.z() < 0 || item.z() > 100) {
            throw invalid("가구 위치는 0에서 100 사이여야 합니다.");
        }
        if (!Double.isFinite(item.rotation())) throw invalid("가구 회전 값이 올바르지 않습니다.");
        double radians = Math.toRadians(item.rotation());
        double cos = Math.cos(radians);
        double sin = Math.sin(radians);
        return new OrientedBox(
                room.width() * item.x() / 100.0,
                room.depth() * item.z() / 100.0,
                new Axis(cos, sin),
                new Axis(-sin, cos),
                size.width() / 2,
                size.depth() / 2
        );
    }

    private boolean insideRoom(Dimensions room, OrientedBox box) {
        double extentX = Math.abs(box.axisX().x() * box.halfWidth()) + Math.abs(box.axisZ().x() * box.halfDepth());
        double extentZ = Math.abs(box.axisX().z() * box.halfWidth()) + Math.abs(box.axisZ().z() * box.halfDepth());
        return box.centerX() - extentX >= -EPSILON && box.centerX() + extentX <= room.width() + EPSILON
                && box.centerZ() - extentZ >= -EPSILON && box.centerZ() + extentZ <= room.depth() + EPSILON;
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

    private record FurnitureSize(double width, double depth) {}
    private record Axis(double x, double z) {}
    private record OrientedBox(double centerX, double centerZ, Axis axisX, Axis axisZ,
                               double halfWidth, double halfDepth) {}
}
