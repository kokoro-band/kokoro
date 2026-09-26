package com.kokoro.room.project;

import java.util.List;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.UNPROCESSABLE_CONTENT;

public class LayoutChoiceException extends ResponseStatusException {
    public record Candidate(String id, String name) {}
    private final String code;
    private final String choiceKey;
    private final List<Candidate> candidates;
    public LayoutChoiceException(String code, String message, String choiceKey, List<Candidate> candidates) {
        super(UNPROCESSABLE_CONTENT, message);
        this.code = code;
        this.choiceKey = choiceKey;
        this.candidates = List.copyOf(candidates);
    }
    public String code() { return code; }
    public String choiceKey() { return choiceKey; }
    public List<Candidate> candidates() { return candidates; }
}
