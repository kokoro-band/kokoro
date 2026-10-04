package com.kokoro.room;

import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.LayoutIntentException;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.Opening;
import com.kokoro.room.project.ProjectModels.Point;
import com.kokoro.room.project.ProjectModels.RoomBounds;
import com.kokoro.room.project.ProjectModels.RoomModel;
import com.kokoro.room.project.ProjectModels.Wall;
import com.kokoro.room.project.RelativePlacementPlanner;
import com.kokoro.room.project.RelativePlacementPlanner.AnchorKind;
import com.kokoro.room.project.RelativePlacementPlanner.Placement;
import com.kokoro.room.project.RelativePlacementPlanner.Proximity;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RelativePlacementPlannerTest {
    private final FurniturePlacementValidator validator = new FurniturePlacementValidator();
    private final RelativePlacementPlanner planner = new RelativePlacementPlanner(validator);
    private final FurnitureItem chair = new FurnitureItem("new", "chair-shell", "셸 체어", "의자", 0.0, 0.0, 0.0, "#4A665A");
    private final FurnitureItem sofa = new FurnitureItem("new", "sofa-cloud", "클라우드 소파", "소파", 0.0, 0.0, 0.0, "#D8C8B8");

    /** Rectangle room whose walls follow the outline; wall ids are w0 (top), w1 (right), w2 (bottom), w3 (left). */
    private static RoomModel room(List<Point> outline, Opening... openings) {
        List<Wall> walls = new ArrayList<>();
        for (int i = 0; i < outline.size(); i++) {
            walls.add(new Wall("w" + i, outline.get(i), outline.get((i + 1) % outline.size()), 0.1));
        }
        double maxX = outline.stream().mapToDouble(Point::x).max().orElse(0);
        double maxZ = outline.stream().mapToDouble(Point::z).max().orElse(0);
        return new RoomModel(2, "m", 2.4, new RoomBounds(maxX, maxZ), outline, walls, List.of(openings), null, null, null);
    }

    private static RoomModel rect(double width, double depth, Opening... openings) {
        return room(List.of(new Point(0, 0), new Point(width, 0), new Point(width, depth), new Point(0, depth)), openings);
    }

    private static Opening opening(String wallId, String type, double from, double to) {
        return new Opening(wallId + "-" + type, wallId, type, from, to, 0.9, 2.1);
    }

    private static double distance(Placement placement, double x, double z) {
        return Math.hypot(placement.x() - x, placement.z() - z);
    }

    private List<FurnitureItem> withPlacements(List<FurnitureItem> existing, FurnitureItem template, List<Placement> placed) {
        List<FurnitureItem> all = new ArrayList<>(existing);
        for (int i = 0; i < placed.size(); i++) {
            Placement p = placed.get(i);
            all.add(new FurnitureItem("p" + i, template.catalogId(), template.name(), template.category(),
                    p.x(), p.z(), (double) p.rotation(), template.color()));
        }
        return all;
    }

    @Test
    void placementFollowsTheWindowWhenTheWindowMoves() {
        Dimensions dims = new Dimensions(5, 4, 2.4);
        RoomModel windowOnTop = rect(5, 4, opening("w0", "window", 2.0, 3.0));
        RoomModel windowOnBottom = rect(5, 4, opening("w2", "window", 2.0, 3.0));

        Placement top = planner.placeNew(dims, windowOnTop, List.of(), chair, 1, AnchorKind.WINDOW, Proximity.NEAR).get(0);
        Placement bottom = planner.placeNew(dims, windowOnBottom, List.of(), chair, 1, AnchorKind.WINDOW, Proximity.NEAR).get(0);

        assertThat(distance(top, 2.5, 0)).isLessThan(1.0);
        assertThat(distance(bottom, 2.5, 4)).isLessThan(1.0);
        assertThat(top.z()).isLessThan(bottom.z());
        validator.validate(dims, windowOnTop, withPlacements(List.of(), chair, List.of(top)));
        validator.validate(dims, windowOnBottom, withPlacements(List.of(), chair, List.of(bottom)));
    }

    @Test
    void twoChairsDoNotOverlapAndAreBothValid() {
        Dimensions dims = new Dimensions(5, 4, 2.4);
        RoomModel room = rect(5, 4, opening("w0", "window", 2.0, 3.0));

        List<Placement> placed = planner.placeNew(dims, room, List.of(), chair, 2, AnchorKind.WINDOW, Proximity.NEAR);

        assertThat(placed).hasSize(2);
        assertThat(placed.get(0)).isNotEqualTo(placed.get(1));
        validator.validate(dims, room, withPlacements(List.of(), chair, placed));
    }

    @Test
    void roomWithoutTheRequestedAnchorIsRejectedInsteadOfPretendingToSucceed() {
        Dimensions dims = new Dimensions(5, 4, 2.4);
        RoomModel noWindow = rect(5, 4, opening("w2", "door", 1.0, 1.9));

        assertThatThrownBy(() -> planner.placeNew(dims, noWindow, List.of(), chair, 1, AnchorKind.WINDOW, Proximity.NEAR))
                .isInstanceOf(LayoutIntentException.class).hasFieldOrPropertyWithValue("code", "NO_ANCHOR");
        assertThatThrownBy(() -> planner.placeNew(dims, null, List.of(), chair, 1, AnchorKind.WINDOW, Proximity.NEAR))
                .isInstanceOf(LayoutIntentException.class).hasFieldOrPropertyWithValue("code", "NO_ANCHOR");
    }

    @Test
    void lShapedRoomKeepsThePlacementInsideTheOutline() {
        Dimensions dims = new Dimensions(6, 5, 2.4);
        // L shape: the top-right 3x2.5 corner is missing.
        RoomModel room = room(List.of(new Point(0, 0), new Point(3, 0), new Point(3, 2.5), new Point(6, 2.5),
                new Point(6, 5), new Point(0, 5)), opening("w1", "window", 0.5, 1.5));

        Placement placed = planner.placeNew(dims, room, List.of(), sofa, 1, AnchorKind.WINDOW, Proximity.NEAR).get(0);

        validator.validate(dims, room, withPlacements(List.of(), sofa, List.of(placed)));
    }

    @Test
    void farFromIsFartherFromTheDoorThanNear() {
        Dimensions dims = new Dimensions(5, 4, 2.4);
        RoomModel room = rect(5, 4, opening("w2", "door", 1.0, 1.9));
        double doorX = 1.45;
        double doorZ = 4;

        Placement near = planner.placeNew(dims, room, List.of(), chair, 1, AnchorKind.DOOR, Proximity.NEAR).get(0);
        Placement far = planner.placeNew(dims, room, List.of(), chair, 1, AnchorKind.DOOR, Proximity.FAR_FROM).get(0);

        assertThat(distance(far, doorX, doorZ)).isGreaterThan(distance(near, doorX, doorZ) + 1.0);
        validator.validate(dims, room, withPlacements(List.of(), chair, List.of(far)));
    }

    @Test
    void placementNextToADoorNeverBlocksTheDoorClearance() {
        Dimensions dims = new Dimensions(5, 4, 2.4);
        RoomModel room = rect(5, 4, opening("w2", "door", 1.0, 1.9));

        Placement placed = planner.placeNew(dims, room, List.of(), chair, 1, AnchorKind.DOOR, Proximity.NEAR).get(0);

        validator.validate(dims, room, withPlacements(List.of(), chair, List.of(placed)));
    }

    @Test
    void existingFurnitureIsAnObstacle() {
        Dimensions dims = new Dimensions(5, 4, 2.4);
        RoomModel room = rect(5, 4, opening("w0", "window", 2.0, 3.0));
        Placement first = planner.placeNew(dims, room, List.of(), chair, 1, AnchorKind.WINDOW, Proximity.NEAR).get(0);
        List<FurnitureItem> existing = withPlacements(List.of(), chair, List.of(first));

        Placement second = planner.placeNew(dims, room, existing, chair, 1, AnchorKind.WINDOW, Proximity.NEAR).get(0);

        assertThat(second).isNotEqualTo(first);
        List<FurnitureItem> all = new ArrayList<>(existing);
        all.add(new FurnitureItem("p1", "chair-shell", "셸 체어", "의자", second.x(), second.z(), (double) second.rotation(), "#4A665A"));
        validator.validate(dims, room, all);
    }

    @Test
    void whenAnyChairDoesNotFitNothingIsPlaced() {
        Dimensions dims = new Dimensions(1.2, 1.2, 2.4);
        RoomModel tiny = rect(1.2, 1.2, opening("w0", "window", 0.3, 0.9));

        assertThatThrownBy(() -> planner.placeNew(dims, tiny, List.of(), sofa, 1, AnchorKind.WINDOW, Proximity.NEAR))
                .isInstanceOf(LayoutIntentException.class).hasFieldOrPropertyWithValue("code", "NO_VALID_PLACEMENT");
        assertThatThrownBy(() -> planner.placeNew(dims, tiny, List.of(), chair, 5, AnchorKind.WINDOW, Proximity.NEAR))
                .isInstanceOf(LayoutIntentException.class).hasFieldOrPropertyWithValue("code", "NO_VALID_PLACEMENT");
    }

    @Test
    void movingKeepsTheRotationAndGoesNextToTheWindow() {
        Dimensions dims = new Dimensions(5, 4, 2.4);
        RoomModel room = rect(5, 4, opening("w0", "window", 2.0, 3.0));
        FurnitureItem target = new FurnitureItem("c1", "chair-shell", "셸 체어", "의자", 4.0, 3.0, 90.0, "#4A665A");

        Placement moved = planner.moveExisting(dims, room, List.of(target), target, AnchorKind.WINDOW, Proximity.NEAR);

        assertThat(moved.rotation()).isEqualTo(90);
        assertThat(distance(moved, 2.5, 0)).isLessThan(1.0);
        validator.validate(dims, room, List.of(new FurnitureItem("c1", "chair-shell", "셸 체어", "의자", moved.x(), moved.z(), 90.0, "#4A665A")));
    }

    @Test
    void sameInputGivesTheSameResult() {
        Dimensions dims = new Dimensions(5, 4, 2.4);
        RoomModel room = rect(5, 4, opening("w0", "window", 1.0, 2.0), opening("w1", "window", 1.0, 2.0));

        List<Placement> first = planner.placeNew(dims, room, List.of(), chair, 3, AnchorKind.WINDOW, Proximity.NEAR);
        List<Placement> second = planner.placeNew(dims, room, List.of(), chair, 3, AnchorKind.WINDOW, Proximity.NEAR);

        assertThat(first).hasSize(3).isEqualTo(second);
    }
}
