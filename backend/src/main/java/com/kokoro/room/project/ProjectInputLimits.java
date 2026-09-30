package com.kokoro.room.project;

import org.springframework.web.server.ResponseStatusException;
import java.util.regex.Pattern;
import java.util.List;
import java.util.Set;
import static com.kokoro.room.project.ProjectModels.*;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

public final class ProjectInputLimits {
    private ProjectInputLimits() {}

    // Java String.length and JavaScript .length both count UTF-16 code units.
    // 80 graphemes is a browser policy; Java 17 segmentation uses an older Unicode version.
    private static final Pattern BLANK = Pattern.compile("[\\s\\p{Z}\\uFEFF]*");
    public static final int MAX_FURNITURE_COUNT = 200;
    private static final double MAX_SAFE_COORDINATE = 9007199254740991d;
    private static final Set<String> RESERVED_IDS = Set.of("__proto__", "constructor", "prototype");
    private static final Set<String> CATEGORIES = Set.of("소파", "테이블", "의자", "장식");

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

    public static void dimensions(Dimensions value) {
        if (value == null || !between(value.width(), 0.5, 200) || !between(value.depth(), 0.5, 200)
                || !between(value.height(), 0.5, 20))
            throw new ResponseStatusException(BAD_REQUEST, "가로와 세로는 0.5~200m이고 높이는 0.5~20m여야 합니다.");
    }

    public static void furniture(List<FurnitureItem> items) {
        if (items == null) throw new ResponseStatusException(BAD_REQUEST, "가구 목록이 필요합니다.");
        furnitureCount(items.size());
        for (FurnitureItem item : items) {
            if (item == null) throw new ResponseStatusException(BAD_REQUEST, "비어 있는 가구 항목을 제거해 주세요.");
            text(item.id(), 100, "가구 식별자는 공백이 아닌 100자 이내 값이어야 합니다.");
            text(item.catalogId(), 100, "가구 카탈로그 식별자는 공백이 아닌 100자 이내 값이어야 합니다.");
            text(item.name(), 200, "가구 이름은 공백이 아닌 200자 이내 값이어야 합니다.");
            text(item.color(), 20, "가구 색상은 공백이 아닌 20자 이내 값이어야 합니다.");
            if (RESERVED_IDS.contains(item.id()) || RESERVED_IDS.contains(item.catalogId()))
                throw new ResponseStatusException(BAD_REQUEST, "사용할 수 없는 가구 식별자입니다.");
            if (item.category() == null || !CATEGORIES.contains(item.category()))
                throw new ResponseStatusException(BAD_REQUEST, "가구 종류는 소파 또는 테이블 또는 의자 또는 장식이어야 합니다.");
            if (!between(item.x(), -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE)
                    || !between(item.z(), -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE))
                throw new ResponseStatusException(BAD_REQUEST, "가구 위치는 브라우저에서 처리할 수 있는 유한한 숫자여야 합니다.");
            if (item.rotation() == null) throw new ResponseStatusException(BAD_REQUEST, "가구 회전 값이 필요합니다.");
        }
    }

    private static boolean between(Double value, double min, double max) {
        return value != null && Double.isFinite(value) && value >= min && value <= max;
    }

    private static void text(String value, int max, String detail) {
        if (value == null || value.length() > max || value.indexOf('\0') >= 0 || BLANK.matcher(value).matches())
            throw new ResponseStatusException(BAD_REQUEST, detail);
    }
}
