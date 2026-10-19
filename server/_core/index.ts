import "dotenv/config";
import { registerPublicSite } from "../public-site-http";
import express from "express";
import { createServer } from "http";
import net from "net";
import { readFile } from "node:fs/promises";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerPrivateDocuments } from "../private-documents";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./static";
import { runtimeConfig, RuntimeConfigurationError } from "../runtime-config";
import {
  registerSecurity,
  operationalErrorHandler,
  safeLog,
} from "../operational-security";
import { registerHealth, operationalChecks } from "../health";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    const host = process.env.HOST || "127.0.0.1";
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const config = runtimeConfig();
  if (config.production) {
    let build;
    try {
      build = JSON.parse(await readFile("dist/build-info.json", "utf8"));
    } catch {
      throw new RuntimeConfigurationError(
        "Metadados do build ausentes; gere a imagem novamente"
      );
    }
    if (
      build.appId !== process.env.VITE_APP_ID ||
      build.oauthPortal !== process.env.VITE_OAUTH_PORTAL_URL
    )
      throw new RuntimeConfigurationError(
        "Configuração pública Manus difere do build; gere a imagem novamente"
      );
  }
  if (
    config.production &&
    !Object.values(await operationalChecks()).every(Boolean)
  )
    throw new RuntimeConfigurationError(
      "Banco, migrações ou armazenamento privado não estão prontos"
    );
  const app = express();
  registerSecurity(app, config);
  registerHealth(app);
  const server = createServer(app);
  registerPrivateDocuments(app);
  // Upload privado usa parser próprio, registrado antes do JSON geral.
  app.use(express.json({ limit: "2mb" }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerPublicSite(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const viteModule = "./vite.ts";
    const { setupVite } = await import(viteModule);
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  app.use(operationalErrorHandler);
  const preferredPort = config.port;
  const port = config.production
    ? preferredPort
    : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.on("error", () => {
    safeLog("server.error");
    process.exitCode = 1;
  });
  server.listen(port, config.host, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => {
      safeLog("server.shutdown_timeout");
      process.exit(1);
    }, 60000);
    timer.unref();
    server.close(() => {
      clearTimeout(timer);
      process.exit(0);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

startServer().catch(error => {
  console.error(
    "[Startup]",
    error instanceof RuntimeConfigurationError
      ? error.message
      : "Configuração ou inicialização inválida; execute a conferência de produção."
  );
  process.exitCode = 1;
});
