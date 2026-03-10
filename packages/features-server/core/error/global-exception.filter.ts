import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { captureServerError } from "../analytics";
import { isAppError } from "../../shared/errors";
import { getHttpStatus } from "../../shared/errors";
import { createLogger } from "../logger/create-logger";

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    timestamp: string;
    path: string;
    requestId: string | number;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private logger = createLogger("http");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();

    const requestId = request.id;
    const path = request.url;
    const method = request.method;
    const userId = (request as any).user?.id;

    let statusCode: number;
    let message: string;
    let code: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      message =
        typeof response === "string"
          ? response
          : (response as any).message ?? exception.message;
      if (Array.isArray(message)) {
        message = message[0];
      }
      code = HttpStatus[statusCode] ?? "UNKNOWN_ERROR";
    } else if (isAppError(exception)) {
      statusCode = getHttpStatus(exception.code);
      message = exception.message;
      code = exception.code;
    } else if (exception instanceof Error) {
      statusCode = 500;
      message =
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : exception.message;
      code = "INTERNAL_SERVER_ERROR";
    } else {
      statusCode = 500;
      message = "Internal server error";
      code = "INTERNAL_SERVER_ERROR";
    }

    if (statusCode >= 500) {
      const originalMessage =
        exception instanceof Error ? exception.message : String(exception);
      const stack =
        exception instanceof Error ? exception.stack : undefined;

      captureServerError({
        path,
        method,
        statusCode,
        errorMessage: originalMessage,
        errorCode: code,
        requestId,
        userId,
        stack,
      });
    }

    if (statusCode >= 500) {
      this.logger.error("Unhandled exception", {
        "request.id": requestId,
        "http.method": method,
        "http.route": path,
        "http.status_code": statusCode,
        "error.type": code,
        "error.message":
          exception instanceof Error ? exception.message : String(exception),
        "error.stack":
          exception instanceof Error ? exception.stack : undefined,
        "user.id": userId,
      });
    } else if (statusCode >= 400) {
      this.logger.warn("Client error", {
        "request.id": requestId,
        "http.method": method,
        "http.route": path,
        "http.status_code": statusCode,
        "error.type": code,
        "error.message": message,
      });
    }

    const errorResponse: ErrorResponse = {
      error: {
        code,
        message,
        statusCode,
        timestamp: new Date().toISOString(),
        path,
        requestId,
      },
    };

    reply.status(statusCode).send(errorResponse);
  }
}
