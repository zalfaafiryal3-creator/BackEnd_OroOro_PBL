import { NextFunction, Request, Response } from 'express';
import { logInfo } from '../lib/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  let recorded = false;

  const recordRequest = () => {
    if (recorded) return;
    recorded = true;

    const routePath = req.route?.path;
    const endpoint = routePath === undefined
      ? 'unmatched'
      : `${req.baseUrl}${String(routePath)}`;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logInfo('http_request', {
      method: req.method,
      endpoint,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  };

  res.once('finish', recordRequest);
  res.once('close', recordRequest);
  next();
}
