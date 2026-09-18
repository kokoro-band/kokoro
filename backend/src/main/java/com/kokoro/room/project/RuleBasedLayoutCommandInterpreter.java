package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.LayoutActionType;
import com.kokoro.room.project.ProjectModels.LayoutCommand;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class RuleBasedLayoutCommandInterpreter implements LayoutCommandInterpreter {
    @Override
    public Interpretation interpret(String message) {
        String normalized = message.replace(" ", "").toLowerCase();
        if (normalized.contains("비워") || normalized.contains("전부삭제") || normalized.contains("모두삭제")) {
            return new Interpretation("가구를 모두 삭제할까요? 확인 후 적용할게요.",
                    List.of(new LayoutCommand(LayoutActionType.CLEAR, null, null, null, null, null)), true);
        }

        List<LayoutCommand> commands = new ArrayList<>();
        String catalogId = target(normalized);
        if (catalogId != null && (normalized.contains("삭제") || normalized.contains("제거"))) {
            commands.add(new LayoutCommand(LayoutActionType.REMOVE, catalogId, null, null, null, null));
        } else if (catalogId != null && (normalized.contains("회전") || normalized.contains("돌려"))) {
            Matcher matcher = Pattern.compile("(-?\\d+)도").matcher(normalized);
            int rotation = matcher.find() ? Integer.parseInt(matcher.group(1)) : 90;
            commands.add(new LayoutCommand(LayoutActionType.ROTATE, catalogId, null, null, null, rotation));
        } else if (catalogId != null && (normalized.contains("이동") || normalized.contains("옮"))) {
            commands.add(new LayoutCommand(LayoutActionType.MOVE, catalogId,
                    null, normalized.contains("창가") ? 72.0 : 50.0,
                    normalized.contains("창가") ? 24.0 : 50.0, null));
        } else {
            if (normalized.contains("소파")) commands.add(add("sofa-cloud", 24, 67));
            if (normalized.contains("테이블") || normalized.contains("책상")) commands.add(add("table-oak", 54, 48));
            if (normalized.contains("의자")) commands.add(add("chair-shell", 68, 34));
            if (normalized.contains("식물") || normalized.contains("화분")) commands.add(add("plant-olive", 84, 74));
        }

        if (commands.isEmpty()) {
            return new Interpretation("소파, 테이블, 의자, 화분 중 원하는 가구와 위치를 함께 말해 주세요.", List.of(), false);
        }
        return new Interpretation("요청한 가구를 배치할게요.", commands, false);
    }

    private static LayoutCommand add(String catalogId, double x, double z) {
        return new LayoutCommand(LayoutActionType.ADD, catalogId, null, x, z, 0);
    }

    private static String target(String normalized) {
        if (normalized.contains("소파")) return "sofa-cloud";
        if (normalized.contains("테이블") || normalized.contains("책상")) return "table-oak";
        if (normalized.contains("의자")) return "chair-shell";
        if (normalized.contains("식물") || normalized.contains("화분")) return "plant-olive";
        return null;
    }
}
