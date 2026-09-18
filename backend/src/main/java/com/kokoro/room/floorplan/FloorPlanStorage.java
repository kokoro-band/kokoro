package com.kokoro.room.floorplan;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

public interface FloorPlanStorage {
    StoredFloorPlan store(String projectId, MultipartFile file) throws IOException;

    void delete(String objectKey) throws IOException;

    record StoredFloorPlan(String objectKey, String fileName, String contentType, long size) {}
}
