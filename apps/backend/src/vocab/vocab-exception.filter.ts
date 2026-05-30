import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import type { VocabErrorResponse } from "@assistant/shared";

/**
 * Normalises every error thrown by the vocab endpoints into the extension's
 * contract shape: `{ status: "error", reason }`. Validation errors thrown by
 * the service already carry that body and pass through untouched; any other
 * failure becomes a 500 `server_error`.
 */
@Catch()
export class VocabExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (isVocabError(body)) {
        res.status(exception.getStatus()).json(body);
        return;
      }
    }

    const serverError: VocabErrorResponse = {
      status: "error",
      reason: "server_error",
    };
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(serverError);
  }
}

function isVocabError(body: unknown): body is VocabErrorResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { status?: unknown }).status === "error"
  );
}
