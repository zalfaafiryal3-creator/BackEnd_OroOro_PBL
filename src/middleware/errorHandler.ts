import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { isRecord } from '../lib/validate';
import { logError } from '../lib/logger';

function logServerError(err: unknown, req: Request, statusCode: number): void {
  const routePath = req.route?.path;
  const endpoint = routePath === undefined
    ? 'unmatched'
    : `${req.baseUrl}${String(routePath)}`;
  const rawErrorName = err instanceof Error ? err.name : 'UnknownError';
  const errorName = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(rawErrorName)
    ? rawErrorName
    : 'Error';
  const rawErrorCode = isRecord(err) && typeof err.code === 'string'
    ? err.code
    : undefined;
  const errorCode = rawErrorCode && /^[A-Za-z0-9_-]{1,40}$/.test(rawErrorCode)
    ? rawErrorCode
    : undefined;

  logError('request_error', {
    method: req.method,
    endpoint,
    statusCode,
    errorName,
    errorCode,
  });
}

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) {
    logServerError(err, _req, res.statusCode);
    next(err);
    return;
  }

  if (isRecord(err) && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Format JSON tidak valid.' });
    return;
  }

  if (isRecord(err) && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Data yang dikirim terlalu besar.' });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Data sudah terdaftar.' });
      return;
    }

    if (err.code === 'P2003') {
      res.status(400).json({ error: 'Data terkait tidak valid.' });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Data tidak ditemukan.' });
      return;
    }

    if (['P2000', 'P2006', 'P2007', 'P2011', 'P2012'].includes(err.code)) {
      res.status(400).json({ error: 'Data yang dikirim tidak valid.' });
      return;
    }
  }

  logServerError(err, _req, 500);
  res.status(500).json({ error: 'Terjadi kesalahan di server.' });
};
