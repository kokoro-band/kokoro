package com.kokoro.room;

import com.kokoro.room.floorplan.LocalFloorPlanStorage;
import com.kokoro.room.floorplan.FloorPlanStorage.StoredFloorPlan;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class FloorPlanStorageTest {
    @TempDir
    Path tempDir;

    @Test
    void storesAndDeletesAPlanWithoutUsingTheOriginalFileNameAsAPath() throws Exception {
        LocalFloorPlanStorage storage = new LocalFloorPlanStorage(tempDir.toString());
        MockMultipartFile file = new MockMultipartFile(
                "file", "../living room/plan.pdf", "application/pdf", "floor-plan".getBytes());

        StoredFloorPlan stored = storage.store("living-room-01", file);

        assertThat(stored.objectKey()).startsWith("living-room-01/").doesNotContain("/../");
        Path storedPath = tempDir.resolve(stored.objectKey());
        assertThat(Files.readString(storedPath)).isEqualTo("floor-plan");

        storage.delete(stored.objectKey());

        assertThat(Files.exists(storedPath)).isFalse();
    }
}
