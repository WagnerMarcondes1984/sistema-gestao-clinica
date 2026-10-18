import type { Express } from "express";
// O proxy legado não tinha autorização por arquivo. Documentos privados usam o fluxo autenticado próprio.
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", (_req, res) =>
    res
      .set("Cache-Control", "no-store")
      .status(404)
      .send("Recurso indisponível")
  );
}
