package com.kokoro.room;

import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(com.kokoro.room.project.InvalidRoomException.class)
    public ProblemDetail invalidRoom(com.kokoro.room.project.InvalidRoomException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(400), exception.getMessage());
        problem.setProperty("code", "INVALID_ROOM");
        problem.setProperty("violations", exception.violations());
        return problem;
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail handle(ResponseStatusException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatusCode.valueOf(exception.getStatusCode().value()), exception.getReason());
        return problem;
    }
}
