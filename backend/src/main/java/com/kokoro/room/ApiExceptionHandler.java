package com.kokoro.room;

import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
    public ProblemDetail invalidRequest() {
        return ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(400),
                "요청의 필수 항목과 입력 형식을 확인해 주세요.");
    }

    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public ProblemDetail uploadTooLarge() {
        return ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(413), "도면은 15MiB 이하여야 합니다.");
    }

    @ExceptionHandler(com.kokoro.room.project.InvalidRoomException.class)
    public ProblemDetail invalidRoom(com.kokoro.room.project.InvalidRoomException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(400), exception.getMessage());
        problem.setProperty("code", "INVALID_ROOM");
        problem.setProperty("violations", exception.violations());
        return problem;
    }
    @ExceptionHandler(com.kokoro.room.project.FurniturePlacementException.class)
    public ProblemDetail furniturePlacement(com.kokoro.room.project.FurniturePlacementException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(400), exception.getMessage());
        problem.setProperty("code", exception.code());
        problem.setProperty("furnitureIds", exception.furnitureIds());
        if (exception.wallId() != null) problem.setProperty("wallId", exception.wallId());
        if (exception.openingId() != null) problem.setProperty("openingId", exception.openingId());
        return problem;
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail handle(ResponseStatusException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatusCode.valueOf(exception.getStatusCode().value()), exception.getReason());
        return problem;
    }
}
