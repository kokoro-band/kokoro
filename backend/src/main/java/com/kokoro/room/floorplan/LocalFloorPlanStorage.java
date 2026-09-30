package com.kokoro.room.floorplan;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@Component
public class LocalFloorPlanStorage implements FloorPlanStorage {
    private final Path root;

    public LocalFloorPlanStorage(
            @Value("${app.floor-plan-storage-root:${java.io.tmpdir}/kokoro/floor-plans}") String root
    ) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    @Override
    public StoredFloorPlan store(String projectId, MultipartFile file) throws IOException {
        String safeProjectId = safeSegment(projectId);
        String originalName = file.getOriginalFilename() == null ? "floor-plan" : file.getOriginalFilename();
        String objectKey = safeProjectId + "/" + UUID.randomUUID() + "/source";
        Path target = root.resolve(objectKey).normalize();
        if (!target.startsWith(root)) throw new IOException("도면 저장 경로가 올바르지 않습니다.");

        Files.createDirectories(target.getParent());
        try (InputStream input = file.getInputStream()) {
            Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException | RuntimeException exception) {
            try {
                Files.deleteIfExists(target);
            } catch (IOException cleanupFailure) {
                exception.addSuppressed(cleanupFailure);
            }
            throw exception;
        }
        return new StoredFloorPlan(objectKey, originalName, file.getContentType(), file.getSize());
    }

    @Override
    public void delete(String objectKey) throws IOException {
        Path target = root.resolve(objectKey).normalize();
        if (!target.startsWith(root)) throw new IOException("도면 삭제 경로가 올바르지 않습니다.");
        Files.deleteIfExists(target);
    }

    private static String safeSegment(String value) {
        String normalized = value.replace('\\', '_').replace('/', '_').replaceAll("[^\\p{L}\\p{N}._-]", "_");
        return normalized.isBlank() ? "floor-plan" : normalized;
    }
}
