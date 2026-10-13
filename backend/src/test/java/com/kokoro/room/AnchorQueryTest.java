package com.kokoro.room;

import com.kokoro.room.project.AnchorQuery;
import com.kokoro.room.project.LayoutIntentException;
import com.kokoro.room.project.RelativePlacementPlanner.AnchorKind;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AnchorQueryTest {
    @Test
    void windowWordsMeanWindowEvenWhenTheyContainTheDoorCharacter() {
        for (String query : new String[] {"창가", "창문", "창문 옆", " 큰 창 ", "창문가"}) {
            assertThat(AnchorQuery.kind(query)).as(query).isEqualTo(AnchorKind.WINDOW);
        }
    }

    @Test
    void doorWordsMeanDoor() {
        for (String query : new String[] {"문", "문 옆", "현관문", "방문 앞"}) {
            assertThat(AnchorQuery.kind(query)).as(query).isEqualTo(AnchorKind.DOOR);
        }
    }

    @Test
    void anythingElseHasNoAnchor() {
        for (String query : new String[] {"벽", "구석", "소파", "침대 옆"}) {
            assertThatThrownBy(() -> AnchorQuery.kind(query)).as(query)
                    .isInstanceOf(LayoutIntentException.class).hasFieldOrPropertyWithValue("code", "NO_ANCHOR");
        }
    }
}
