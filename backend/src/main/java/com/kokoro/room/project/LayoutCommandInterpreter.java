package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.LayoutCommand;
import com.kokoro.room.project.ProjectModels.RoomBounds;

import java.util.List;

public interface LayoutCommandInterpreter {
    /** Bounds are meters and let the interpreter return absolute positions. */
    Interpretation interpret(String message, RoomBounds bounds);

    record Interpretation(String reply, List<LayoutCommand> commands, boolean requiresConfirmation) {}
}
