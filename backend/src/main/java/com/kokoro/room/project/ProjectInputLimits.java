package com.kokoro.room.project;

import org.springframework.web.server.ResponseStatusException;
import java.util.regex.Pattern;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

public final class ProjectInputLimits {
    private ProjectInputLimits() {}

    // Java String.length and JavaScript .length both count UTF-16 code units.
    // 80 graphemes is a browser policy; Java 17 segmentation uses an older Unicode version.
    private static final Pattern BLANK = Pattern.compile("[\\s\\p{Z}\\uFEFF]*");
    public static final int MAX_FURNITURE_COUNT = 200;

    public static void name(String value) {
        text(value, 1024, "프로젝트 이름은 공백이 아닌 값으로 입력하고 너무 긴 결합 문자는 줄여 주세요.");
    }

    public static void roomType(String value) {
        text(value, 80, "방 종류는 공백이 아닌 값으로 80자 이내로 입력해 주세요.");
    }

    public static void message(String value) {
        text(value, 1000, "요청은 공백이 아닌 값으로 1000자 이내로 입력해 주세요. 이모지는 여러 자로 계산될 수 있어요.");
    }

    public static void furnitureCount(int count) {
        if (count > MAX_FURNITURE_COUNT)
            throw new ResponseStatusException(BAD_REQUEST, "가구는 최대 200개까지 배치할 수 있어요.");
    }

    private static void text(String value, int max, String detail) {
        if (value == null || value.length() > max || BLANK.matcher(value).matches())
            throw new ResponseStatusException(BAD_REQUEST, detail);
    }
}
