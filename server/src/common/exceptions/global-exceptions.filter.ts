import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'Internal server error';
    let retryAfterSeconds: number | undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exceptionResponse && typeof exceptionResponse === 'object') {
      const body = exceptionResponse as {
        message?: string | string[];
        retryAfterSeconds?: number;
        data?: { retryAfterSeconds?: number };
      };

      if ('message' in body) {
        if (Array.isArray(body.message)) {
          message = body.message.join(', ');
        } else if (typeof body.message === 'string') {
          message = body.message;
        }
      }

      const candidate = body.retryAfterSeconds ?? body.data?.retryAfterSeconds;
      if (Number.isFinite(candidate)) {
        retryAfterSeconds = candidate;
      }
    } else if (!(exception instanceof Error)) {
      message = 'Internal server error';
    }

    const stack = exception instanceof Error ? exception.stack : undefined;
    const exceptionName =
      typeof exception === 'object' && exception !== null
        ? (exception.constructor?.name ?? 'Unknown')
        : 'Unknown';

    const logContext = {
      context: 'GlobalExceptionsFilter',
      statusCode: status,
      method: request.method,
      path: request.url,
      message,
      timestamp: new Date().toISOString(),
      exceptionName,
      stack,
    };

    const summary = `${request.method} ${request.url} -> ${status} ${message}`;

    if (exception instanceof HttpException && status < 500) {
      this.logger.warn({ summary, ...logContext });
    } else if (exception instanceof Error) {
      this.logger.error({ summary, ...logContext });
    } else {
      this.logger.error({
        summary: `Unexpected non-error exception: ${String(exception)}`,
        ...logContext,
      });
    }

    // Let rate-limited clients back off properly instead of retrying blindly.
    if (
      status === HttpStatus.TOO_MANY_REQUESTS &&
      Number.isFinite(retryAfterSeconds)
    ) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }

    response.status(status).json({
      statusCode: status,
      message,
      error: true,
    });
  }
}
