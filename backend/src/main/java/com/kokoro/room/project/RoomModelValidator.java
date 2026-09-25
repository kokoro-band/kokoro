package com.kokoro.room.project;

import org.springframework.stereotype.Component;

import java.awt.geom.Area;
import java.awt.geom.Path2D;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.kokoro.room.project.ProjectModels.*;

@Component
public class RoomModelValidator {
    private static final double EPSILON = 1e-8;

    public void validate(RoomModel room) {
        List<InvalidRoomException.Violation> errors = new ArrayList<>();
        if (room == null) throw new InvalidRoomException(List.of(new InvalidRoomException.Violation("room", "공간이 필요합니다.")));
        if (!Integer.valueOf(2).equals(room.version())) add(errors, "version", "버전은 2여야 합니다.");
        if (!"m".equals(room.unit())) add(errors, "unit", "단위는 m이어야 합니다.");
        if (!between(room.wallHeight(), 0.5, 20)) add(errors, "wallHeight", "층고는 0.5~20m여야 합니다.");
        RoomBounds bounds = room.bounds();
        if (bounds == null || !between(bounds.width(), 0.5, 200) || !between(bounds.depth(), 0.5, 200)) {
            add(errors, "bounds", "가로와 세로는 0.5~200m여야 합니다.");
            throw new InvalidRoomException(errors);
        }
        boolean outlineValid = polygon(room.outline(), bounds, "outline", errors);
        Map<String, Wall> walls = new HashMap<>();
        if (room.walls() == null || room.walls().size() > 1024) {
            add(errors, "walls", "벽은 최대 1024개입니다.");
        } else {
            for (int i = 0; i < room.walls().size(); i++) {
                Wall wall = room.walls().get(i);
                String path = "walls[" + i + "]";
                if (wall == null || wall.id() == null || wall.id().isBlank() || wall.id().length() > 128) {
                    add(errors, path, "벽 식별자가 필요하며 최대 128자입니다.");
                    continue;
                }
                if (walls.putIfAbsent(wall.id(), wall) != null) add(errors, path + ".id", "벽 식별자가 중복됩니다.");
                if (!point(wall.a(), bounds) || !point(wall.b(), bounds)
                        || distance(wall.a(), wall.b()) <= EPSILON) {
                    add(errors, path, "벽은 범위 안의 서로 다른 두 점이어야 합니다.");
                } else if (outlineValid && (!inside(room.outline(), wall.a()) || !inside(room.outline(), wall.b()))) {
                    add(errors, path, "벽 끝점이 공간 외곽을 벗어났습니다.");
                }
                if (wall.thickness() == null || !Double.isFinite(wall.thickness()) || wall.thickness() <= 0) {
                    add(errors, path + ".thickness", "벽 두께는 양수여야 합니다.");
                }
            }
        }
        if (room.openings() == null || room.openings().size() > 1024) {
            add(errors, "openings", "문과 창은 최대 1024개입니다.");
        } else {
            Set<String> ids = new HashSet<>();
            List<Opening> valid = new ArrayList<>();
            for (int i = 0; i < room.openings().size(); i++) {
                Opening opening = room.openings().get(i);
                String path = "openings[" + i + "]";
                if (opening == null || opening.id() == null || opening.id().isBlank() || opening.id().length() > 128) {
                    add(errors, path, "문과 창 식별자가 필요하며 최대 128자입니다.");
                    continue;
                }
                if (!ids.add(opening.id())) add(errors, path + ".id", "식별자가 중복됩니다.");
                Wall wall = walls.get(opening.wallId());
                if (wall == null || !point(wall.a(), bounds) || !point(wall.b(), bounds)) {
                    add(errors, path + ".wallId", "유효한 벽을 선택해야 합니다.");
                    continue;
                }
                if (!"door".equals(opening.type()) && !"window".equals(opening.type())) add(errors, path + ".type", "door 또는 window만 허용합니다.");
                if (!between(opening.from(), 0, distance(wall.a(), wall.b()))
                        || !between(opening.to(), 0, distance(wall.a(), wall.b()))
                        || opening.from() >= opening.to()
                        || !between(opening.bottom(), 0, room.wallHeight() == null ? 0 : room.wallHeight())
                        || !between(opening.top(), 0, room.wallHeight() == null ? 0 : room.wallHeight())
                        || opening.bottom() >= opening.top()) {
                    add(errors, path, "문과 창의 폭과 높이가 벽 범위 안에 있어야 합니다.");
                    continue;
                }
                for (Opening other : valid) {
                    if (other.wallId().equals(opening.wallId())
                            && Math.min(other.to(), opening.to()) > Math.max(other.from(), opening.from()) + EPSILON
                            && Math.min(other.top(), opening.top()) > Math.max(other.bottom(), opening.bottom()) + EPSILON) {
                        add(errors, path, "같은 벽의 문과 창이 겹칩니다.");
                        break;
                    }
                }
                valid.add(opening);
            }
        }
        if (room.spawn() != null && (!point(room.spawn(), bounds) || (outlineValid && !inside(room.outline(), room.spawn())))) {
            add(errors, "spawn", "시작 위치는 공간 안에 있어야 합니다.");
        }
        if (room.rooms() != null) {
            int points = room.rooms().stream().filter(label -> label != null && label.polygon() != null)
                    .mapToInt(label -> label.polygon().size()).sum();
            if (room.rooms().size() > 128 || points > 4096) {
                add(errors, "rooms", "방 이름 영역은 최대 128개이며 좌표 합계는 4096점입니다.");
            } else {
                for (int i = 0; i < room.rooms().size(); i++) {
                    RoomLabel label = room.rooms().get(i);
                    String path = "rooms[" + i + "]";
                    if (label == null || label.name() == null || label.name().isBlank() || label.name().length() > 80) {
                        add(errors, path, "방 이름은 1~80자여야 합니다.");
                        continue;
                    }
                    if (polygon(label.polygon(), bounds, path + ".polygon", errors) && outlineValid) {
                        Area outside = new Area(shape(label.polygon()));
                        outside.subtract(new Area(shape(room.outline())));
                        if (!outside.isEmpty()) add(errors, path + ".polygon", "방 영역이 공간 외곽을 벗어났습니다.");
                    }
                }
            }
        }
        if (room.source() != null && (!between(room.source().areaPyeong(), 0.1, 10000)
                || room.source().roomCount() < 1 || room.source().roomCount() > 128
                || room.source().preset() == null || room.source().preset().isBlank()
                || room.source().preset().length() > 80)) {
            add(errors, "source", "공간 생성 면적과 방 개수 및 규칙 이름을 확인해 주세요.");
        }
        if (!errors.isEmpty()) throw new InvalidRoomException(errors);
    }

    private boolean polygon(List<Point> polygon, RoomBounds bounds, String path, List<InvalidRoomException.Violation> errors) {
        if (polygon == null || polygon.size() < 3 || polygon.size() > 512) {
            add(errors, path, "다각형은 3~512점이어야 합니다.");
            return false;
        }
        for (Point point : polygon) {
            if (!point(point, bounds)) {
                add(errors, path, "좌표는 공간 범위 안의 유한한 숫자여야 합니다.");
                return false;
            }
        }
        double twiceArea = 0;
        for (int i = 0; i < polygon.size(); i++) {
            Point a = polygon.get(i), b = polygon.get((i + 1) % polygon.size());
            if (distance(a, b) <= EPSILON) {
                add(errors, path, "인접한 점이 중복됩니다.");
                return false;
            }
            twiceArea += a.x() * b.z() - b.x() * a.z();
            for (int j = i + 1; j < polygon.size(); j++) {
                if (j == i + 1 || (i == 0 && j == polygon.size() - 1)) continue;
                Point c = polygon.get(j), d = polygon.get((j + 1) % polygon.size());
                if (java.awt.geom.Line2D.linesIntersect(a.x(), a.z(), b.x(), b.z(), c.x(), c.z(), d.x(), d.z())) {
                    add(errors, path, "다각형의 변이 서로 교차합니다.");
                    return false;
                }
            }
        }
        if (Math.abs(twiceArea) <= EPSILON) {
            add(errors, path, "공간 넓이가 0입니다.");
            return false;
        }
        return true;
    }

    private static boolean between(Double value, double min, double max) {
        return value != null && Double.isFinite(value) && value >= min && value <= max;
    }

    private static boolean point(Point point, RoomBounds bounds) {
        return point != null && between(point.x(), 0, bounds.width()) && between(point.z(), 0, bounds.depth());
    }

    private static double distance(Point a, Point b) {
        return Math.hypot(a.x() - b.x(), a.z() - b.z());
    }

    private static Path2D shape(List<Point> polygon) {
        Path2D path = new Path2D.Double();
        path.moveTo(polygon.get(0).x(), polygon.get(0).z());
        for (int i = 1; i < polygon.size(); i++) path.lineTo(polygon.get(i).x(), polygon.get(i).z());
        path.closePath();
        return path;
    }

    private static boolean inside(List<Point> polygon, Point point) {
        if (shape(polygon).contains(point.x(), point.z())) return true;
        for (int i = 0; i < polygon.size(); i++) {
            Point a = polygon.get(i), b = polygon.get((i + 1) % polygon.size());
            if (java.awt.geom.Line2D.ptSegDist(a.x(), a.z(), b.x(), b.z(), point.x(), point.z()) <= EPSILON) return true;
        }
        return false;
    }

    private static void add(List<InvalidRoomException.Violation> errors, String path, String reason) {
        if (errors.size() < 32) errors.add(new InvalidRoomException.Violation(path, reason));
    }
}
