package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.LayoutCommand;

import java.util.List;

public interface LayoutCommandInterpreter {
    Interpretation interpret(String message);

    record Interpretation(String reply, List<LayoutCommand> commands, boolean requiresConfirmation) {}
}
