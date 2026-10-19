import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) throw new Error("Build público não encontrado");
  app.use(express.static(distPath));
  app.use("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}
