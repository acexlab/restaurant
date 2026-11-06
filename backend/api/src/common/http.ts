import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NestMiddleware,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import { z, ZodTypeAny } from 'zod';
import type { XevaRequest } from './context';

export const indianMobile = z.string().regex(/^(\+91)?[6-9]\d{9}$/, 'invalid Indian mobile number');

/** Validate input with zod; throws a 400 with field-level issues. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

/** Adds a correlation ID to every request (echoed back in X-Correlation-Id). */
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: XevaRequest, res: Response, next: NextFunction) {
    const incoming = req.header('x-correlation-id');
    req.correlationId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Correlation-Id', req.correlationId);
    next();
  }
}

/** Consistent error responses (spec 10): { error: { statusCode, code, message, details?, correlationId } } */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<XevaRequest>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        code = typeof b.code === 'string' ? b.code : HttpStatus[statusCode] ?? 'ERROR';
        message = typeof b.message === 'string' ? b.message : exception.message;
        details = b.details;
      } else {
        code = HttpStatus[statusCode] ?? 'ERROR';
        message = String(body);
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(statusCode).json({
      error: { statusCode, code, message, ...(details ? { details } : {}), correlationId: req.correlationId },
    });
  }
}

export function httpError(status: HttpStatus, code: string, message: string, details?: unknown) {
  return new HttpException({ code, message, details }, status);
}
