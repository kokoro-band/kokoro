package com.kokoro.room;

import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail handle(ResponseStatusException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatusCode.valueOf(exception.getStatusCode().value()), exception.getReason());
        return problem;
    }
}
