package com.kokoro.room;

import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.Point;
import com.kokoro.room.project.ProjectModels.RoomBounds;
import com.kokoro.room.project.ProjectModels.RoomModel;
import com.kokoro.room.project.ProjectModels.Wall;
import com.kokoro.room.project.ProjectModels.Opening;
import com.kokoro.room.project.InvalidPlacementException;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

class FurniturePlacementValidatorTest {
    private final FurniturePlacementValidator validator = new FurniturePlacementValidator();
    private final Dimensions dimensions = new Dimensions(5.8, 4.2, 2.4);

    @Test
    void rejectsFurnitureOutsideRoom() {
        FurnitureItem sofa = furniture("sofa-01", "sofa-cloud", 5.5, 2.1, 0);

        assertThatThrownBy(() -> validator.validate(dimensions, null, List.of(sofa)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("방 경계");
    }

    @Test
    void rejectsRotatedFurnitureOverlap() {
        FurnitureItem first = furniture("chair-01", "chair-shell", 2.9, 2.1, 45);
        FurnitureItem second = furniture("chair-02", "chair-shell", 3.2, 2.1, 0);

        assertThatThrownBy(() -> validator.validate(dimensions, null, List.of(first, second)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("겹칩니다");
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
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("방 경계");
    }

    @Test
    void allowsFurnitureInsideOutline() {
        FurnitureItem chair = furniture("chair-01", "chair-shell", 1.5, 3.5, 0);

        validator.validate(dimensions, lShapedRoom(), List.of(chair));
    }

    @Test
    void rejectsAnEdgeCrossingAConcaveNotchEvenWhenAllFourCornersAreInside() {
        var room = new RoomModel(2, "m", 2.4, new RoomBounds(4, 4),
                List.of(new Point(0, 0), new Point(4, 0), new Point(4, 4), new Point(2.5, 4),
                        new Point(2.5, 2.2), new Point(1.5, 2.2), new Point(1.5, 4), new Point(0, 4)),
                List.of(), List.of(), List.of(), null, null);
        assertThatThrownBy(() -> validator.validate(dimensions, room,
                List.of(furniture("notch-sofa", "sofa-cloud", 2, 2.6, 0))))
                .isInstanceOfSatisfying(InvalidPlacementException.class, error -> {
                    assertThat(error.code()).isEqualTo("OUTSIDE_ROOM");
                    assertThat(error.furnitureIds()).containsExactly("notch-sofa");
                });
    }

    @Test
    void rejectsInternalWallCrossingAtZeroNinetyAndFortyFiveDegrees() {
        for (int rotation : new int[] {0, 90, 45}) {
            assertThatThrownBy(() -> validator.validate(dimensions, partitionedRoom(),
                    List.of(furniture("chair", "chair-shell", 3, 3, rotation))))
                    .isInstanceOfSatisfying(InvalidPlacementException.class, error -> {
                        assertThat(error.code()).isEqualTo("WALL_COLLISION");
                        assertThat(error.wallId()).isEqualTo("partition");
                        assertThat(error.furnitureIds()).containsExactly("chair");
                    });
        }
    }

    @Test
    void aDoorDoesNotMakeTheWholeWallPassableAndHasClearanceOnBothSides() {
        for (double x : new double[] {2.2, 3.8}) {
            assertThatThrownBy(() -> validator.validate(dimensions, partitionedRoom(),
                    List.of(furniture("chair", "chair-shell", x, 2, 0))))
                    .isInstanceOfSatisfying(InvalidPlacementException.class, error -> {
                        assertThat(error.code()).isEqualTo("DOOR_CLEARANCE");
                        assertThat(error.openingId()).isEqualTo("door");
                    });
        }
    }

    @Test
    void permitsTouchingTheWallFaceAndTheDoorClearanceBoundary() {
        validator.validate(dimensions, partitionedRoom(),
                List.of(furniture("chair", "chair-shell", 3.425, 3.4, 0)));
        validator.validate(dimensions, partitionedRoom(),
                List.of(furniture("chair", "chair-shell", 4.225, 2, 0)));
    }

    @Test
    void rejectsDuplicateIdsAndUnknownCatalogsWithoutDependingOnDatabaseErrors() {
        var chair = furniture("duplicate", "chair-shell", 1, 1, 0);
        assertThatThrownBy(() -> validator.validate(dimensions, null,
                List.of(chair, furniture("duplicate", "chair-shell", 4, 3, 0))))
                .isInstanceOfSatisfying(InvalidPlacementException.class,
                        error -> assertThat(error.code()).isEqualTo("DUPLICATE_FURNITURE_ID"));
        assertThatThrownBy(() -> validator.validate(dimensions, null,
                List.of(furniture("unknown", "unknown", 1, 1, 0))))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> validator.validate(dimensions, null,
                List.of(furniture("bad", "chair-shell", Double.NaN, 1, 0))))
                .isInstanceOf(ResponseStatusException.class);
    }

    private static RoomModel partitionedRoom() {
        return new RoomModel(2, "m", 2.4, new RoomBounds(6, 4),
                List.of(new Point(0, 0), new Point(6, 0), new Point(6, 4), new Point(0, 4)),
                List.of(new Wall("partition", new Point(3, 0), new Point(3, 4), 0.2)),
                List.of(new Opening("door", "partition", "door", 1.5, 2.5, 0.0, 2.0)),
                List.of(), null, null);
    }

    /** 오른쪽 아래가 파인 ㄱ자 평면입니다. */
    private static RoomModel lShapedRoom() {
        return new RoomModel(2, "m", 2.4, new RoomBounds(6.0, 4.0),
                List.of(new Point(0, 0), new Point(6, 0), new Point(6, 2), new Point(3, 2),
                        new Point(3, 4), new Point(0, 4)),
                List.of(), List.of(), List.of(), null, null);
    }

    private static FurnitureItem furniture(String id, String catalogId, double x, double z, int rotation) {
        return new FurnitureItem(id, catalogId, catalogId, "의자", x, z, rotation, "#000000");
    }
}
