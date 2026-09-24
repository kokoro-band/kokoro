package com.kokoro.room;

import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.Point;
import com.kokoro.room.project.ProjectModels.RoomBounds;
import com.kokoro.room.project.ProjectModels.RoomModel;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
