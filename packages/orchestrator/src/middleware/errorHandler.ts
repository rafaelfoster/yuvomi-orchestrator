import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";

export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    logger.error({ err, path: req.path, method: req.method }, "unhandled request error");
    if (res.headersSent) return;
    res.status(500).json({ error: "internal server error" });
  };
}
