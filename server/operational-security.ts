import { randomUUID, createHash } from "node:crypto";
import type {
  Express,
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import type { RuntimeConfig } from "./runtime-config";
export function safeLog(
  event: string,
  fields: {
    requestId?: string;
    category?: string;
    status?: number;
    durationMs?: number;
  } = {}
) {
  const allowed = {
    requestId: fields.requestId,
    category: fields.category,
    status: fields.status,
    durationMs: fields.durationMs,
  };
  console.error(JSON.stringify({ event, ...allowed }));
}
export function registerSecurity(
  app: Express,
  config: RuntimeConfig,
  options: { limit?: number; now?: () => number } = {}
) {
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  const counters = new Map<string, { count: number; until: number }>(),
    now = options.now || Date.now,
    limit = options.limit || (config.production ? 600 : 1800);
  let nextSweep = 0;
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID(),
      start = now();
    res.locals.requestId = requestId;
    res.set({
      "X-Request-ID": requestId,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    if (
      req.path.startsWith("/api/") ||
      req.path.startsWith("/portal") ||
      req.path.startsWith("/app/")
    )
      res.set("Cache-Control", "no-store");
    if (config.production && req.secure)
      res.set("Strict-Transport-Security", "max-age=31536000");
    res.once("finish", () => {
      if (res.statusCode >= 500)
        safeLog("request.failed", {
          requestId,
          category: req.path.startsWith("/api/") ? "api" : "page",
          status: res.statusCode,
          durationMs: Math.max(0, now() - start),
        });
    });
    if (
      config.production &&
      !req.secure &&
      !["/health/live", "/health/ready"].includes(req.path)
    ) {
      res.status(426).json({ error: "HTTPS obrigatório", requestId });
      return;
    }
    if (
      req.path.startsWith("/api/") ||
      req.path === "/manus-storage" ||
      req.path.startsWith("/manus-storage/")
    ) {
      const t = now();
      if (t >= nextSweep) {
        for (const [k, v] of counters) if (v.until <= t) counters.delete(k);
        nextSweep = t + 30000;
      }
      const key = createHash("sha256")
        .update(req.ip || req.socket.remoteAddress || "unknown")
        .digest("hex");
      let entry = counters.get(key);
      if (entry && entry.until <= t) {
        counters.delete(key);
        entry = undefined;
      }
      if (!entry) {
        if (counters.size >= 10000) {
          res
            .set("Retry-After", "60")
            .status(429)
            .json({ error: "Tente novamente em instantes", requestId });
          return;
        }
        entry = { count: 0, until: t + 60000 };
        counters.set(key, entry);
      }
      if (++entry.count > limit) {
        res
          .set(
            "Retry-After",
            String(Math.max(1, Math.ceil((entry.until - t) / 1000)))
          )
          .status(429)
          .json({ error: "Limite temporário de requisições", requestId });
        return;
      }
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin,
        expected = config.origin || `${req.protocol}://${req.get("host")}`;
      if (
        req.headers["sec-fetch-site"] === "cross-site" ||
        (origin !== undefined && origin !== expected)
      ) {
        res
          .status(403)
          .json({ error: "Origem da operação não autorizada", requestId });
        return;
      }
      if (
        req.is("application/x-www-form-urlencoded") ||
        req.is("multipart/form-data") ||
        req.is("text/plain")
      ) {
        res
          .status(415)
          .json({ error: "Formato da operação não suportado", requestId });
        return;
      }
    }
    next();
  });
}
export const operationalErrorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next
) => {
  if (res.headersSent) {
    res.end();
    return;
  }
  const status =
    error?.type === "entity.too.large"
      ? 413
      : error instanceof SyntaxError
        ? 400
        : 500;
  res
    .status(status)
    .json({
      error:
        status === 413
          ? "Corpo da requisição excede o limite"
          : status === 400
            ? "Conteúdo inválido"
            : "Não foi possível concluir a solicitação",
      requestId: res.locals.requestId,
    });
};
