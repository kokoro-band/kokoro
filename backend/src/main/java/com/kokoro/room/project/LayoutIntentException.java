package com.kokoro.room.project;

/** A layout intent that cannot be turned into a valid placement; the code tells the client why. */
public class LayoutIntentException extends RuntimeException {
    private final String code;

    public LayoutIntentException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
