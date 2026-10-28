package io.github.motokitabata.skillweave.common.handler;

import io.github.motokitabata.skillweave.common.exception.BuildConflictException;
import io.github.motokitabata.skillweave.common.exception.BuildNotFoundException;
import io.github.motokitabata.skillweave.common.exception.CharmConflictException;
import io.github.motokitabata.skillweave.common.exception.CharmNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * 例外を {@code application/problem+json} に変換する。400（検証・本文の読み取り）は基底クラスが ProblemDetail にする。
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(CharmNotFoundException.class)
    ProblemDetail notFound(CharmNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(CharmConflictException.class)
    ProblemDetail conflict(CharmConflictException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(BuildNotFoundException.class)
    ProblemDetail buildNotFound(BuildNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(BuildConflictException.class)
    ProblemDetail buildConflict(BuildConflictException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
    }
}
