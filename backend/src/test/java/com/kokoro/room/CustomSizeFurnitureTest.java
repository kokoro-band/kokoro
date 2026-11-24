package com.kokoro.room;

import com.kokoro.room.project.FurniturePlacementException;
import com.kokoro.room.project.FurniturePlacementValidator;
import com.kokoro.room.project.ProjectModels.Dimensions;
import com.kokoro.room.project.ProjectModels.FurnitureItem;
import com.kokoro.room.project.ProjectModels.FurnitureSize;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 사진으로 잰 가구처럼 카탈로그가 아닌 자기 크기를 가진 가구. */
class CustomSizeFurnitureTest {
    private final FurniturePlacementValidator validator = new FurniturePlacementValidator();
    private final Dimensions room = new Dimensions(6, 5, 2.4);

    private static FurnitureItem fridge(double x, double z, FurnitureSize size) {
        return new FurnitureItem("fridge", "custom-box", "냉장고", "기타", x, z, 0.0, "#F2F2F2", size);
    }

    private static FurnitureItem chair(double x, double z) {
        return new FurnitureItem("chair", "chair-shell", "의자", "의자", x, z, 0.0, "#000000");
    }

    @Test
    void customFurnitureCollidesWithItsOwnSize() {
        // 가로 2m인 사용자 가구는 x=2에서 1~3m를 차지하므로 x=3.2의 의자와 겹친다
        FurnitureItem wide = fridge(2.0, 2.5, new FurnitureSize(2.0, 0.5, 1.0));

        assertThatThrownBy(() -> validator.validate(room, null, List.of(wide, chair(3.2, 2.5))))
                .isInstanceOf(FurniturePlacementException.class)
                .satisfies(error -> assertThat(((FurniturePlacementException) error).code())
                        .isEqualTo("FURNITURE_OVERLAP"));
    }

    @Test
    void smallCustomFurnitureFitsWhereTheWideOneDidNot() {
        FurnitureItem narrow = fridge(2.0, 2.5, new FurnitureSize(0.5, 0.55, 1.05));

        validator.validate(room, null, List.of(narrow, chair(3.2, 2.5)));
    }

    @Test
    void customFurnitureMustStayInsideTheRoomBySize() {
        FurnitureItem nearWall = fridge(5.6, 2.5, new FurnitureSize(1.0, 0.5, 1.0));

        assertThatThrownBy(() -> validator.validate(room, null, List.of(nearWall)))
                .isInstanceOf(FurniturePlacementException.class)
                .satisfies(error -> assertThat(((FurniturePlacementException) error).code())
                        .isEqualTo("OUTSIDE_ROOM"));
    }

    @Test
    void otherCategoryIsAccepted() {
        validator.validateData(List.of(fridge(2, 2, new FurnitureSize(0.5, 0.55, 1.05))));
    }

    @Test
    void customFurnitureWithoutSizeIsRejected() {
        assertThatThrownBy(() -> validator.validateData(List.of(fridge(2, 2, null))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("크기");
    }

    @Test
    void catalogFurnitureWithSizeIsRejected() {
        FurnitureItem resized = new FurnitureItem("chair", "chair-shell", "의자", "의자", 2.0, 2.0, 0.0, "#000000",
                new FurnitureSize(3.0, 3.0, 3.0));

        assertThatThrownBy(() -> validator.validateData(List.of(resized)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("크기");
    }

    @ParameterizedTest
    @ValueSource(doubles = {0.04, 5.01, Double.NaN, Double.POSITIVE_INFINITY, -1})
    void sizeOutsideRangeIsRejected(double bad) {
        for (FurnitureSize size : List.of(
                new FurnitureSize(bad, 0.5, 1.0), new FurnitureSize(0.5, bad, 1.0), new FurnitureSize(0.5, 0.5, bad))) {
            assertThatThrownBy(() -> validator.validateData(List.of(fridge(2, 2, size))))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("0.05~5m");
        }
    }

    @Test
    void missingSideIsRejected() {
        assertThatThrownBy(() -> validator.validateData(List.of(fridge(2, 2, new FurnitureSize(0.5, null, 1.0)))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("0.05~5m");
    }

    @Test
    void sizeBoundariesAreAccepted() {
        validator.validateData(List.of(fridge(2, 2, new FurnitureSize(0.05, 5.0, 0.05))));
    }

    @Test
    void movingAndRotatingKeepTheSize() {
        FurnitureSize size = new FurnitureSize(0.5, 0.55, 1.05);
        FurnitureItem moved = fridge(2, 2, size).moved(3, 1).rotated(90);

        assertThat(moved.size()).isEqualTo(size);
        assertThat(moved.x()).isEqualTo(3.0);
        assertThat(moved.rotation()).isEqualTo(90.0);
    }

    @Test
    void jsonOmitsSizeForCatalogFurnitureAndReadsItBackForCustomFurniture() {
        var mapper = JsonMapper.builder().build();

        assertThat(mapper.writeValueAsString(chair(1, 1))).doesNotContain("size");
        FurnitureItem read = mapper.readValue("""
                {"id":"fridge","catalogId":"custom-box","name":"냉장고","category":"기타","x":2,"z":2,
                 "rotation":0,"color":"#F2F2F2","size":{"width":0.5,"depth":0.55,"height":1.05}}
                """, FurnitureItem.class);
        assertThat(read.size()).isEqualTo(new FurnitureSize(0.5, 0.55, 1.05));
        FurnitureItem old = mapper.readValue("""
                {"id":"chair","catalogId":"chair-shell","name":"의자","category":"의자","x":1,"z":1,
                 "rotation":0,"color":"#000000"}
                """, FurnitureItem.class);
        assertThat(old.size()).isNull();
    }
}
