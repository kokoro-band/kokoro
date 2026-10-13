package com.kokoro.room.floorplan;

import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Locale;

import static org.springframework.http.HttpStatus.*;

public final class FloorPlanUploadValidator {
    public static final int MAX_BYTES = 15 * 1024 * 1024;
    public static final long MAX_PIXELS = 16_000_000;
    private static final byte[] PNG = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};

    private FloorPlanUploadValidator() {}

    public static MultipartFile validate(MultipartFile file) throws IOException {
        String name = file.getOriginalFilename();
        if (name == null || name.isBlank() || name.codePointCount(0, name.length()) > 255
                || name.contains("/") || name.contains("\\") || name.codePoints().anyMatch(Character::isISOControl)) {
            throw new ResponseStatusException(BAD_REQUEST, "파일명은 경로와 제어 문자 없이 1~255자로 입력해 주세요.");
        }
        if (file.getSize() > MAX_BYTES) throw tooLarge();
        int extensionStart = name.lastIndexOf('.');
        if (extensionStart < 0) throw unsupported();
        String extension = name.substring(extensionStart + 1).toLowerCase(Locale.ROOT);
        String expectedType = switch (extension) {
            case "pdf" -> "application/pdf";
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            default -> throw unsupported();
        };
        if (!expectedType.equalsIgnoreCase(file.getContentType())) throw unsupported();

        byte[] bytes;
        try (InputStream input = file.getInputStream()) {
            bytes = input.readNBytes(MAX_BYTES + 1);
        }
        if (bytes.length == 0) throw new ResponseStatusException(BAD_REQUEST, "도면 파일이 비어 있습니다.");
        if (bytes.length > MAX_BYTES) throw tooLarge();
        boolean matches = switch (expectedType) {
            case "application/pdf" -> bytes.length >= 8 && startsWith(bytes, "%PDF-".getBytes(StandardCharsets.US_ASCII))
                    && bytes[5] >= '1' && bytes[5] <= '2' && bytes[6] == '.' && bytes[7] >= '0' && bytes[7] <= '9';
            case "image/png" -> startsWith(bytes, PNG);
            case "image/jpeg" -> startsWith(bytes, new byte[]{(byte) 255, (byte) 216, (byte) 255});
            default -> false;
        };
        if (!matches) throw unsupported();
        if (!expectedType.equals("application/pdf")) validateImageDimensions(bytes);
        // Downstream storage sees only these validated bytes, never the original multipart stream again.
        return new ValidatedFile(file.getName(), name, expectedType, bytes);
    }

    private static void validateImageDimensions(byte[] bytes) {
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw unsupported();
            var reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width <= 0 || height <= 0) throw unsupported();
                if ((long) width * height > MAX_PIXELS) {
                    throw new ResponseStatusException(PAYLOAD_TOO_LARGE, "이미지는 1600만 픽셀 이하로 줄여서 올려 주세요.");
                }
            } finally {
                reader.dispose();
            }
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw unsupported();
        }
    }

    private static boolean startsWith(byte[] bytes, byte[] prefix) {
        return bytes.length >= prefix.length && Arrays.equals(bytes, 0, prefix.length, prefix, 0, prefix.length);
    }

    private static ResponseStatusException tooLarge() {
        return new ResponseStatusException(PAYLOAD_TOO_LARGE, "도면은 15MiB 이하여야 합니다.");
    }

    private static ResponseStatusException unsupported() {
        return new ResponseStatusException(UNSUPPORTED_MEDIA_TYPE, "파일의 확장자와 내용이 일치하는 PDF, PNG, JPG 도면을 올려 주세요.");
    }

    private record ValidatedFile(String fieldName, String fileName, String contentType, byte[] bytes) implements MultipartFile {
        @Override public String getName() { return fieldName; }
        @Override public String getOriginalFilename() { return fileName; }
        @Override public String getContentType() { return contentType; }
        @Override public boolean isEmpty() { return bytes.length == 0; }
        @Override public long getSize() { return bytes.length; }
        @Override public byte[] getBytes() { return bytes.clone(); }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
        @Override public void transferTo(File dest) throws IOException { Files.write(dest.toPath(), bytes); }
    }
}
