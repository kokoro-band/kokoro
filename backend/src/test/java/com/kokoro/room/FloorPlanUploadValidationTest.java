package com.kokoro.room;

import com.kokoro.room.project.FloorPlanJobDispatcher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.stream.Stream;
import java.util.zip.CRC32;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FloorPlanUploadValidationTest {
    private static final int MAX_BYTES = 15 * 1024 * 1024;
    private static final byte[] PDF = "%PDF-1.7\n".getBytes(StandardCharsets.US_ASCII);
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @TempDir static Path storage;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("app.floor-plan-storage-root", () -> storage.toString());
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean FloorPlanJobDispatcher dispatcher;

    static Stream<Arguments> invalidFiles() throws IOException {
        return Stream.of(
                Arguments.of("empty", file("plan.pdf", "application/pdf", new byte[0]), 400),
                Arguments.of("renamed text", file("plan.pdf", "application/pdf", "hello".getBytes()), 415),
                Arguments.of("extension mismatch", file("plan.png", "application/pdf", PDF), 415),
                Arguments.of("no extension", file("pdf", "application/pdf", PDF), 415),
                Arguments.of("signature mismatch", file("plan.jpg", "image/jpeg", image("png")), 415),
                Arguments.of("missing MIME", file("plan.pdf", null, PDF), 415),
                Arguments.of("unsupported", file("plan.webp", "image/webp", PDF), 415),
                Arguments.of("oversize", file("plan.pdf", "application/pdf", Arrays.copyOf(PDF, MAX_BYTES + 1)), 413),
                Arguments.of("name too long", file("가".repeat(252) + ".pdf", "application/pdf", PDF), 400),
                Arguments.of("path", file("../plan.pdf", "application/pdf", PDF), 400),
                Arguments.of("windows path", file("C:\\plan.pdf", "application/pdf", PDF), 400),
                Arguments.of("control", file("plan\n.pdf", "application/pdf", PDF), 400),
                Arguments.of("missing name", file("", "application/pdf", PDF), 400),
                Arguments.of("PNG header only", file("plan.png", "image/png", new byte[]{(byte)137,80,78,71,13,10,26,10}), 415),
                Arguments.of("JPEG header only", file("plan.jpg", "image/jpeg", new byte[]{(byte)255,(byte)216,(byte)255}), 415),
                Arguments.of("zero width", file("plan.png", "image/png", pngDimensions(0, 3)), 415),
                Arguments.of("too many pixels", file("plan.png", "image/png", pngDimensions(4001, 4000)), 413),
                Arguments.of("JPEG pixel limit", file("plan.jpg", "image/jpeg", jpegDimensions(5000, 4000)), 413),
                Arguments.of("pixel integer overflow", file("plan.png", "image/png", pngDimensions(65536, 65536)), 413)
        );
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidFiles")
    void rejectsWithoutChangingProjectOrCreatingJobOrStoredFile(String label, MockMultipartFile file, int status) throws Exception {
        assertRejected(file, status);
    }

    @Test
    void usesActualStreamLengthInsteadOfTrustingDeclaredSize() throws Exception {
        var oversized = new MockMultipartFile("file", "plan.pdf", "application/pdf", PDF) {
            @Override public InputStream getInputStream() {
                return new ByteArrayInputStream(Arrays.copyOf(PDF, MAX_BYTES + 1));
            }
        };
        assertRejected(oversized, 413);
    }

    @Test
    void readFailureDoesNotExposeInternalPathOrCreateSideEffects() throws Exception {
        var unreadable = new MockMultipartFile("file", "plan.pdf", "application/pdf", PDF) {
            @Override public InputStream getInputStream() throws IOException {
                throw new IOException("/private/internal/upload-secret.pdf");
            }
        };
        assertRejected(unreadable, 500);
    }

    @Test
    void storageFailurePreservesProjectAndHidesInternalPath() throws Exception {
        String id = createProject();
        String before = mvc.perform(get("/api/projects/{id}", id)).andReturn().getResponse().getContentAsString();
        // A pre-existing file blocks creation of this project's storage directory.
        Path blocker = storage.resolve(id);
        Files.writeString(blocker, "preserve existing file");
        String response = mvc.perform(multipart("/api/projects/{id}/floor-plan", id)
                        .file(file("plan.pdf", "application/pdf", PDF)))
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.detail").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain(storage.toString(), "FileSystemException");
        String after = mvc.perform(get("/api/projects/{id}", id)).andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(after)).isEqualTo(mapper.readTree(before));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM floor_plan_jobs WHERE project_id = ?", Integer.class, id)).isZero();
        assertThat(Files.readString(blocker)).isEqualTo("preserve existing file");
    }

    @Test
    void storesExactlyTheValidatedBytesAndActualLength() throws Exception {
        var changing = new MockMultipartFile("file", "plan.pdf", "application/pdf", PDF) {
            private int reads;
            @Override public long getSize() { return 1; }
            @Override public InputStream getInputStream() {
                return new ByteArrayInputStream(reads++ == 0 ? PDF : "not a PDF".getBytes());
            }
        };
        String id = createProject();
        mvc.perform(multipart("/api/projects/{id}/floor-plan", id).file(changing))
                .andExpect(status().isOk()).andExpect(jsonPath("$.floorPlan.size").value(PDF.length));
        try (var files = Files.walk(storage.resolve(id))) {
            var saved = files.filter(Files::isRegularFile).toList();
            assertThat(saved).hasSize(1);
            assertThat(Files.readAllBytes(saved.get(0))).isEqualTo(PDF);
        }
    }

    static Stream<Arguments> supportedFiles() throws IOException {
        return Stream.of(
                Arguments.of(file("plan.PDF", "application/pdf", PDF)),
                Arguments.of(file("plan.png", "image/png", image("png"))),
                Arguments.of(file("plan.jpeg", "image/jpeg", image("jpeg"))),
                Arguments.of(file("plan.jpg", "image/jpeg", image("jpeg"))),
                Arguments.of(file("가".repeat(251) + ".pdf", "application/pdf", PDF)),
                Arguments.of(file("🌱".repeat(251) + ".pdf", "application/pdf", PDF)),
                Arguments.of(file("plan.pdf", "application/pdf", Arrays.copyOf(PDF, MAX_BYTES))),
                // Header dimensions are validated without allocating the declared pixel buffer.
                Arguments.of(file("plan.png", "image/png", pngDimensions(4000, 4000)))
        );
    }

    @ParameterizedTest
    @MethodSource("supportedFiles")
    void acceptsSupportedFilesAndBoundaryValues(MockMultipartFile file) throws Exception {
        String id = createProject();
        mvc.perform(multipart("/api/projects/{id}/floor-plan", id).file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.floorPlan.jobId").isNotEmpty())
                .andExpect(jsonPath("$.floorPlan.fileName").value(file.getOriginalFilename()))
                .andExpect(jsonPath("$.floorPlan.objectKey").doesNotExist());
    }

    @Test
    void checksProjectAccessBeforeApplicationFileValidation() throws Exception {
        mvc.perform(multipart("/api/projects/missing-project/floor-plan")
                        .file(file("bad.exe", "text/plain", new byte[]{1})))
                .andExpect(status().isNotFound());
    }

    private void assertRejected(MockMultipartFile file, int expectedStatus) throws Exception {
        String id = createProject();
        String before = mvc.perform(get("/api/projects/{id}", id)).andReturn().getResponse().getContentAsString();
        String response = mvc.perform(multipart("/api/projects/{id}/floor-plan", id).file(file))
                .andExpect(status().is(expectedStatus)).andExpect(jsonPath("$.detail").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("/private/", "upload-secret", "stackTrace");
        String after = mvc.perform(get("/api/projects/{id}", id)).andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(after)).isEqualTo(mapper.readTree(before));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM floor_plan_jobs WHERE project_id = ?", Integer.class, id)).isZero();
        try (var files = Files.walk(storage)) {
            assertThat(files.filter(Files::isRegularFile).filter(path -> path.startsWith(storage.resolve(id))).count()).isZero();
        }
    }

    private String createProject() throws Exception {
        String response = mvc.perform(post("/api/projects").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"도면 검증","roomType":"거실","dimensions":{"width":5,"depth":4,"height":2.4}}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asString();
    }

    private static MockMultipartFile file(String name, String type, byte[] content) {
        return new MockMultipartFile("file", name, type, content);
    }

    private static byte[] image(String format) throws IOException {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 3, BufferedImage.TYPE_INT_RGB), format, output);
        return output.toByteArray();
    }

    private static byte[] pngDimensions(int width, int height) throws IOException {
        byte[] png = image("png");
        ByteBuffer.wrap(png).putInt(16, width).putInt(20, height);
        var crc = new CRC32();
        crc.update(png, 12, 17);
        ByteBuffer.wrap(png).putInt(29, (int) crc.getValue());
        return png;
    }

    private static byte[] jpegDimensions(int width, int height) throws IOException {
        byte[] jpeg = image("jpeg");
        for (int i = 0; i < jpeg.length - 8; i++) {
            if ((jpeg[i] & 255) == 255 && (jpeg[i + 1] & 255) == 192) {
                ByteBuffer.wrap(jpeg).putShort(i + 5, (short) height).putShort(i + 7, (short) width);
                return jpeg;
            }
        }
        throw new AssertionError("JPEG fixture has no SOF0 dimensions");
    }
}
