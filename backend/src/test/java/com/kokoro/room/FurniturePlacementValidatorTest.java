package com.kokoro.room;

import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FurniturePlacementValidatorTest {
    private final FurniturePlacementValidator validator = new FurniturePlacementValidator();
    private final Dimensions room = new Dimensions(5.8, 4.2, 2.4);

    @Test
    void rejectsFurnitureOutsideRoom() {
        FurnitureItem sofa = furniture("sofa-01", "sofa-cloud", 1, 50, 0);

        assertThatThrownBy(() -> validator.validate(room, List.of(sofa)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("방 경계");
    }

    @Test
    void rejectsRotatedFurnitureOverlap() {
        FurnitureItem first = furniture("chair-01", "chair-shell", 50, 50, 45);
        FurnitureItem second = furniture("chair-02", "chair-shell", 54, 50, 0);

        assertThatThrownBy(() -> validator.validate(room, List.of(first, second)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("겹칩니다");
    }

    @Test
    void allowsFurnitureAtRoomBoundary() {
        FurnitureItem first = furniture("chair-01", "chair-shell", 5.603466, 50, 0);
        FurnitureItem second = furniture("chair-02", "chair-shell", 17.0, 50, 0);

        validator.validate(room, List.of(first, second));
    }

    private static FurnitureItem furniture(String id, String catalogId, double x, double z, int rotation) {
        return new FurnitureItem(id, catalogId, catalogId, "의자", x, z, rotation, "#000000");
    }
}
