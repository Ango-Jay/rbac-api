import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const startedAt = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const durationMs = Date.now() - startedAt;
      this.logger.log({
        context: 'HTTP',
        method,
        path: originalUrl,
        statusCode,
        durationMs,
        timestamp: new Date().toISOString(),
      });
    });

    next();
  }
}
