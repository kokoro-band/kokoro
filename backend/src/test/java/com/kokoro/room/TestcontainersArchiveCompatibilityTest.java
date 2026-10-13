package com.kokoro.room;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.MountableFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class TestcontainersArchiveCompatibilityTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @TempDir Path files;

    @Test
    void copiesFileThroughRealContainerArchiveInBothDirections() throws Exception {
        byte[] contents = "코코로 의존성 호환 검사\narchive round trip\n".getBytes(StandardCharsets.UTF_8);
        Path source = files.resolve("source.txt");
        Files.write(source, contents);

        postgres.copyFileToContainer(MountableFile.forHostPath(source), "/tmp/kokoro-archive.txt");
        byte[] restored = postgres.copyFileFromContainer("/tmp/kokoro-archive.txt", input -> input.readAllBytes());

        assertThat(restored).isEqualTo(contents);
    }
}
