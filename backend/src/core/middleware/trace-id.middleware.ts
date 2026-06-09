import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

const TRACE_ID_HEADER = 'x-request-id';

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const traceId = (req.headers[TRACE_ID_HEADER] as string) || uuidv4();
    req.headers[TRACE_ID_HEADER] = traceId;
    res.setHeader(TRACE_ID_HEADER, traceId);
    next();
  }
}
