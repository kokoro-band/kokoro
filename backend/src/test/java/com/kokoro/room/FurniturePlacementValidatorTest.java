package com.kokoro.room;

import com.kokoro.room.project.FurniturePlacementException;
import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.Opening;
import com.kokoro.room.project.ProjectModels.Point;
import com.kokoro.room.project.ProjectModels.RoomBounds;
import com.kokoro.room.project.ProjectModels.RoomModel;
import com.kokoro.room.project.ProjectModels.Wall;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FurniturePlacementValidatorTest {
    private final FurniturePlacementValidator validator = new FurniturePlacementValidator();
    private final Dimensions dimensions = new Dimensions(5.8, 4.2, 2.4);

    @Test
    void rejectsFurnitureOutsideRoom() {
        FurnitureItem sofa = furniture("sofa-01", "sofa-cloud", 5.5, 2.1, 0);

        assertThatThrownBy(() -> validator.validate(dimensions, null, List.of(sofa)))
                .isInstanceOf(FurniturePlacementException.class)
                .hasMessageContaining("방 경계")
                .satisfies(exception -> {
                    FurniturePlacementException placement = (FurniturePlacementException) exception;
                    assertThat(placement.code()).isEqualTo("OUTSIDE_ROOM");
                    assertThat(placement.furnitureIds()).containsExactly("sofa-01");
                });
    }

    @Test
    void rejectsRotatedFurnitureOverlap() {
        FurnitureItem first = furniture("chair-01", "chair-shell", 2.9, 2.1, 45);
        FurnitureItem second = furniture("chair-02", "chair-shell", 3.2, 2.1, 0);

        assertThatThrownBy(() -> validator.validate(dimensions, null, List.of(first, second)))
                .isInstanceOf(FurniturePlacementException.class)
                .hasMessageContaining("겹칩니다")
                .satisfies(exception -> {
                    FurniturePlacementException placement = (FurniturePlacementException) exception;
                    assertThat(placement.code()).isEqualTo("FURNITURE_OVERLAP");
                    assertThat(placement.furnitureIds()).containsExactly("chair-01", "chair-02");
                });
    }

    @Test
    void allowsFurnitureAtRoomBoundary() {
        FurnitureItem first = furniture("chair-01", "chair-shell", 0.325, 2.1, 0);
        FurnitureItem second = furniture("chair-02", "chair-shell", 5.475, 2.1, 0);

        validator.validate(dimensions, null, List.of(first, second));
    }

    @Test
    void rejectsFurnitureInsideBoundingBoxButOutsideOutline() {
        FurnitureItem chair = furniture("chair-01", "chair-shell", 5.0, 3.5, 0);

        assertThatThrownBy(() -> validator.validate(dimensions, lShapedRoom(), List.of(chair)))
                .isInstanceOf(FurniturePlacementException.class)
                .hasMessageContaining("방 경계");
    }

    @Test
    void allowsFurnitureInsideOutline() {
        FurnitureItem chair = furniture("chair-01", "chair-shell", 1.5, 3.5, 0);

        validator.validate(dimensions, lShapedRoom(), List.of(chair));
    }

    @Test
    void rejectsFootprintCrossingConcaveNotchEvenWhenCornersAreInside() {
        // 두 모서리는 폭 안에 있지만 변이 ㄱ자 노치의 빈 공간을 가로지릅니다.
        FurnitureItem table = furniture("table-01", "table-oak", 3.3, 2.2, 45);

        assertThatThrownBy(() -> validator.validate(dimensions, lShapedRoom(), List.of(table)))
                .isInstanceOf(FurniturePlacementException.class)
                .satisfies(exception -> assertThat(((FurniturePlacementException) exception).code()).isEqualTo("OUTSIDE_ROOM"));
    }

    @Test
    void rejectsFurnitureCrossingInternalWall() {
        FurnitureItem chair = furniture("chair-01", "chair-shell", 3.0, 2.0, 0);

        assertThatThrownBy(() -> validator.validate(dimensions, roomWithInternalWall(), List.of(chair)))
                .isInstanceOf(FurniturePlacementException.class)
                .satisfies(exception -> {
                    FurniturePlacementException placement = (FurniturePlacementException) exception;
                    assertThat(placement.code()).isEqualTo("WALL_COLLISION");
                    assertThat(placement.wallId()).isEqualTo("wall-1");
                });
    }

    @Test
    void rejectsFurnitureInDoorClearance() {
        FurnitureItem chair = furniture("chair-01", "chair-shell", 3.0, 0.5, 0);

        assertThatThrownBy(() -> validator.validate(dimensions, roomWithDoor(), List.of(chair)))
                .isInstanceOf(FurniturePlacementException.class)
                .satisfies(exception -> {
                    FurniturePlacementException placement = (FurniturePlacementException) exception;
                    assertThat(placement.code()).isEqualTo("DOOR_CLEARANCE");
                    assertThat(placement.openingId()).isEqualTo("opening-1");
                });
    }

    @Test
    void allowsFurnitureOutsideDoorClearance() {
        FurnitureItem chair = furniture("chair-01", "chair-shell", 5.0, 2.0, 0);

        validator.validate(dimensions, roomWithDoor(), List.of(chair));
    }

    @Test
    void rejectsDuplicateFurnitureIds() {
        FurnitureItem first = furniture("chair-01", "chair-shell", 1.0, 1.0, 0);
        FurnitureItem second = furniture("chair-01", "chair-shell", 4.0, 3.0, 0);

        assertThatThrownBy(() -> validator.validate(dimensions, null, List.of(first, second)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("중복");
    }

    /** 오른쪽 아래가 파인 ㄱ자 평면입니다. */
    private static RoomModel lShapedRoom() {
        return new RoomModel(2, "m", 2.4, new RoomBounds(6.0, 4.0),
                List.of(new Point(0, 0), new Point(6, 0), new Point(6, 2), new Point(3, 2),
                        new Point(3, 4), new Point(0, 4)),
                List.of(), List.of(), List.of(), null, null);
    }

    /** 방을 세로로 가로지르는 두꺼운 내부 벽이 x=3 에 있습니다. */
    private static RoomModel roomWithInternalWall() {
        Wall wall = new Wall("wall-1", new Point(3, 0), new Point(3, 4.2), 0.2);
        return new RoomModel(2, "m", 2.4, new RoomBounds(5.8, 4.2),
                List.of(new Point(0, 0), new Point(5.8, 0), new Point(5.8, 4.2), new Point(0, 4.2)),
                List.of(wall), List.of(), List.of(), null, null);
    }

    /** z=0 바깥벽 중앙에 폭 1m 문이 있습니다. */
    private static RoomModel roomWithDoor() {
        Wall wall = new Wall("wall-front", new Point(0, 0), new Point(5.8, 0), 0.2);
        Opening door = new Opening("opening-1", "wall-front", "door", 2.4, 3.4, 0.0, 2.1);
        return new RoomModel(2, "m", 2.4, new RoomBounds(5.8, 4.2),
                List.of(new Point(0, 0), new Point(5.8, 0), new Point(5.8, 4.2), new Point(0, 4.2)),
                List.of(wall), List.of(door), List.of(), null, null);
    }

    private static FurnitureItem furniture(String id, String catalogId, double x, double z, double rotation) {
        return new FurnitureItem(id, catalogId, catalogId, "의자", x, z, rotation, "#000000");
    }
}
