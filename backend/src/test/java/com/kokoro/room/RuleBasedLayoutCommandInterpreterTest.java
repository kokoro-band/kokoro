package com.kokoro.room;

import com.kokoro.room.project.RuleBasedLayoutCommandInterpreter;
import com.kokoro.room.project.ProjectModels.LayoutActionType;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RuleBasedLayoutCommandInterpreterTest {
    private final RuleBasedLayoutCommandInterpreter interpreter = new RuleBasedLayoutCommandInterpreter();

    @Test
    void returnsStructuredAddCommand() {
        var result = interpreter.interpret("소파를 배치해줘");

        assertThat(result.requiresConfirmation()).isFalse();
        assertThat(result.commands()).singleElement().satisfies(command -> {
            assertThat(command.type()).isEqualTo(LayoutActionType.ADD);
            assertThat(command.catalogId()).isEqualTo("sofa-cloud");
        });
    }

    @Test
    void asksForConfirmationBeforeClearingLayout() {
        var result = interpreter.interpret("가구 전부 삭제해줘");

        assertThat(result.requiresConfirmation()).isTrue();
        assertThat(result.commands()).extracting(command -> command.type())
                .containsExactly(LayoutActionType.CLEAR);
    }

    @Test
    void parsesMoveRotateAndRemoveCommands() {
        assertThat(interpreter.interpret("창가에 의자를 옮겨줘").commands())
                .extracting(command -> command.type()).containsExactly(LayoutActionType.MOVE);
        assertThat(interpreter.interpret("의자를 90도 회전해줘").commands().get(0).rotation()).isEqualTo(90);
        assertThat(interpreter.interpret("소파를 삭제해줘").commands())
                .extracting(command -> command.type()).containsExactly(LayoutActionType.REMOVE);
    }
}
