import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import {
  mkdir,
  writeFile,
  readFile,
  unlink,
  lstat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import express, {
  type Express,
  type Request,
  type Response,
  type ErrorRequestHandler,
} from "express";
import { and, eq, desc } from "drizzle-orm";
import { mindosPortalDocuments, type User } from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import { withClinic, type Tx, type Clinic } from "./scheduling";
import {
  careAudit,
  patientInClinic,
  clinicalPatient,
  withPortal,
  missing,
  denied,
} from "./care-access";
import { ensureMindosTenantForUser, assertMindosPermission } from "./db";

const MAX_BYTES = 8 * 1024 * 1024;
async function storageRoot() {
  if (!process.env.PRIVATE_DOCUMENT_ROOT)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Configure o armazenamento privado no servidor",
    });
  const root = path.resolve(process.env.PRIVATE_DOCUMENT_ROOT);
  for (const pub of [path.resolve("client"), path.resolve("dist/public")])
    if (root === pub || root.startsWith(pub + path.sep))
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Diretório privado não pode ficar em área pública",
      });
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink())
    throw new Error("Diretório privado não pode ser um link simbólico");
  const real = await realpath(root);
  for (const pub of [path.resolve("client"), path.resolve("dist/public")])
    if (real === pub || real.startsWith(pub + path.sep))
      throw new Error(
        "Armazenamento privado não pode ficar dentro do diretório público"
      );
  return real;
}
function encryptionKey() {
  const key = process.env.DOCUMENT_ENCRYPTION_SECRET;
  if (!key || key.length < 32)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Configure a chave de criptografia de documentos",
    });
  return createHash("sha256")
    .update("mindos-documents:" + key)
    .digest();
}
const aad = (tenantId: number, patientId: number, key: string) =>
  Buffer.from(`${tenantId}:${patientId}:${key}`);
function detectMime(data: Buffer) {
  if (data.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255 &&
    data.at(-2) === 255 &&
    data.at(-1) === 217
  )
    return "image/jpeg";
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Envie PDF, PNG ou JPEG com conteúdo válido",
  });
}
export async function uploadPrivateDocument(
  user: User,
  input: {
    patientId: number;
    title: string;
    fileName: string;
    mimeType: string;
    scope: "ADMINISTRATIVE" | "CLINICAL";
    data: Buffer;
  }
) {
  if (!input.data.length || input.data.length > MAX_BYTES)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Arquivo deve ter até 8 MB",
    });
  const mime = detectMime(input.data);
  if (mime !== input.mimeType)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tipo do arquivo não corresponde ao conteúdo",
    });
  const title = input.title.trim(),
    fileName = input.fileName.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 180);
  if (!title || title.length > 180 || !fileName)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Informe título e nome de arquivo válidos",
    });
  const root = await storageRoot(),
    key = randomUUID() + ".bin";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  let written = false;
  try {
    return await withClinic(user, "MANAGE_DOCUMENTS", async (tx, clinic) => {
      await patientInClinic(tx, clinic.id, input.patientId);
      if (input.scope === "CLINICAL")
        await clinicalPatient(
          tx,
          clinic,
          user,
          input.patientId,
          "VIEW_CLINICAL_RECORD"
        );
      cipher.setAAD(aad(clinic.id, input.patientId, key));
      const encrypted = Buffer.concat([
        cipher.update(input.data),
        cipher.final(),
      ]);
      await writeFile(
        path.join(root, key),
        Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]),
        { flag: "wx", mode: 0o600 }
      );
      written = true;
      const [r] = await tx.insert(mindosPortalDocuments).values({
        tenantId: clinic.id,
        patientId: input.patientId,
        title,
        documentType: "ADMINISTRATIVE",
        scope: input.scope,
        portalVisible: false,
        fileKey: key,
        fileName,
        mimeType: mime,
        fileSize: input.data.length,
        fileHash: createHash("sha256").update(input.data).digest("hex"),
        uploadedByUserId: user.id,
      });
      await careAudit(
        tx,
        clinic.id,
        user.id,
        "DOCUMENT",
        r.insertId,
        "UPLOAD_DOCUMENT",
        input.scope === "CLINICAL" ? "CLINICAL" : "ADMINISTRATIVE"
      );
      return { id: r.insertId };
    });
  } catch (error) {
    if (written) await unlink(path.join(root, key)).catch(() => {});
    throw error;
  }
}
export async function listPrivateDocuments(user: User, patientId: number) {
  return withClinic(user, "VIEW_DOCUMENTS", async (tx, clinic) => {
    await patientInClinic(tx, clinic.id, patientId);
    const rows = await tx
      .select()
      .from(mindosPortalDocuments)
      .where(
        and(
          eq(mindosPortalDocuments.tenantId, clinic.id),
          eq(mindosPortalDocuments.patientId, patientId)
        )
      )
      .orderBy(desc(mindosPortalDocuments.id));
    const result = [];
    for (const row of rows) {
      if (row.scope === "CLINICAL") {
        try {
          await clinicalPatient(
            tx,
            clinic,
            user,
            patientId,
            "VIEW_CLINICAL_RECORD"
          );
        } catch (error) {
          if (error instanceof TRPCError && error.code === "FORBIDDEN")
            continue;
          throw error;
        }
      }
      const { fileKey, fileHash, ...safe } = row;
      result.push({ ...safe, hasFile: Boolean(fileKey) });
    }
    return result;
  });
}
export async function setDocumentAccess(
  user: User,
  input: {
    documentId: number;
    revision: number;
    action: "RELEASE" | "HIDE" | "REVOKE";
  }
) {
  return withClinic(user, "MANAGE_DOCUMENTS", async (tx, clinic) => {
    const [d] = await tx
      .select()
      .from(mindosPortalDocuments)
      .where(
        and(
          eq(mindosPortalDocuments.tenantId, clinic.id),
          eq(mindosPortalDocuments.id, input.documentId)
        )
      )
      .for("update");
    if (!d) return missing();
    await patientInClinic(tx, clinic.id, d.patientId);
    if (d.scope === "CLINICAL")
      await clinicalPatient(
        tx,
        clinic,
        user,
        d.patientId,
        "VIEW_CLINICAL_RECORD"
      );
    if (d.revision !== input.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Documento alterado. Recarregue.",
      });
    if (d.status === "REVOKED")
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Documento revogado é definitivo. Envie uma nova versão.",
      });
    if (input.action === "RELEASE" && !d.fileKey)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Registro legado sem arquivo: envie o documento antes de liberar download",
      });
    await tx
      .update(mindosPortalDocuments)
      .set({
        portalVisible: input.action === "RELEASE",
        status: input.action === "REVOKE" ? "REVOKED" : d.status,
        revokedAt: input.action === "REVOKE" ? new Date() : null,
        revision: d.revision + 1,
      })
      .where(eq(mindosPortalDocuments.id, d.id));
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "DOCUMENT",
      d.id,
      `${input.action}_DOCUMENT`,
      d.scope === "CLINICAL" ? "CLINICAL" : "ADMINISTRATIVE"
    );
    return true;
  });
}
async function readAuthorized(
  tx: Tx,
  clinic: Clinic,
  user: User,
  documentId: number,
  patientId?: number
) {
  const [d] = await tx
    .select()
    .from(mindosPortalDocuments)
    .where(
      and(
        eq(mindosPortalDocuments.tenantId, clinic.id),
        eq(mindosPortalDocuments.id, documentId)
      )
    )
    .for("update");
  if (
    !d ||
    d.status === "REVOKED" ||
    !d.fileKey ||
    (patientId !== undefined && (d.patientId !== patientId || !d.portalVisible))
  )
    return missing();
  if (patientId === undefined) {
    await patientInClinic(tx, clinic.id, d.patientId);
    if (d.scope === "CLINICAL")
      await clinicalPatient(
        tx,
        clinic,
        user,
        d.patientId,
        "VIEW_CLINICAL_RECORD"
      );
  }
  if (!/^[a-f0-9-]{36}\.bin$/.test(d.fileKey))
    throw new TRPCError({
      code: "CONFLICT",
      message: "Arquivo privado inconsistente",
    });
  const root = await storageRoot(),
    location = path.join(root, d.fileKey);
  const stat = await lstat(location).catch(() => null);
  if (
    !stat ||
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_BYTES + 29
  )
    return missing();
  const bytes = await readFile(location);
  let data: Buffer;
  try {
    if (bytes[0] !== 1 || bytes.length < 29) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      bytes.subarray(1, 13)
    );
    decipher.setAAD(aad(d.tenantId, d.patientId, d.fileKey));
    decipher.setAuthTag(bytes.subarray(13, 29));
    data = Buffer.concat([
      decipher.update(bytes.subarray(29)),
      decipher.final(),
    ]);
    if (
      data.length !== d.fileSize ||
      createHash("sha256").update(data).digest("hex") !== d.fileHash ||
      detectMime(data) !== d.mimeType
    )
      throw new Error();
  } catch {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Falha de integridade do documento. Download bloqueado.",
    });
  }
  await careAudit(
    tx,
    clinic.id,
    user.id,
    "DOCUMENT",
    d.id,
    "DOWNLOAD_DOCUMENT",
    d.scope === "CLINICAL" ? "CLINICAL" : "ADMINISTRATIVE"
  );
  return { data, fileName: d.fileName || "documento", mimeType: d.mimeType! };
}
export async function downloadPrivateDocument(user: User, id: number) {
  const { membership } = await ensureMindosTenantForUser(user.id, user.role);
  if (membership.role === "PATIENT")
    return withPortal(user, (tx, clinic, patient) =>
      readAuthorized(tx, clinic, user, id, patient.id)
    );
  return withClinic(user, "VIEW_DOCUMENTS", (tx, clinic) =>
    readAuthorized(tx, clinic, user, id)
  );
}
function replyError(res: Response, error: unknown) {
  const status =
    error instanceof TRPCError
      ? (
          {
            UNAUTHORIZED: 401,
            FORBIDDEN: 403,
            NOT_FOUND: 404,
            BAD_REQUEST: 400,
            CONFLICT: 409,
            PRECONDITION_FAILED: 412,
          } as Record<string, number>
        )[error.code] || 500
      : (error as { status?: number }).status === 413
        ? 413
        : 500;
  res.set("Cache-Control", "no-store");
  res.status(status).json({
    error:
      status === 500
        ? "Não foi possível acessar o documento"
        : error instanceof Error
          ? error.message
          : "Arquivo inválido",
  });
}
async function authenticate(req: Request) {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Entre para acessar documentos",
    });
  }
}
export function registerPrivateDocuments(app: Express) {
  app.post(
    "/api/private-documents/:patientId",
    async (req, res, next) => {
      try {
        res.locals.user = await authenticate(req);
        await assertMindosPermission(
          res.locals.user.id,
          res.locals.user.role,
          "MANAGE_DOCUMENTS"
        );
        if (
          req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host
        )
          return denied("Origem inválida");
        if (
          !["application/pdf", "image/png", "image/jpeg"].includes(
            req.headers["content-type"] || ""
          )
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Tipo de arquivo não permitido",
          });
        next();
      } catch (error) {
        replyError(res, error);
      }
    },
    express.raw({
      type: ["application/pdf", "image/png", "image/jpeg"],
      limit: MAX_BYTES,
    }),
    async (req, res) => {
      try {
        const patientId = Number(req.params.patientId);
        if (!Number.isSafeInteger(patientId) || patientId <= 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Paciente inválido",
          });
        const scope = req.headers["x-document-scope"] || "ADMINISTRATIVE";
        if (scope !== "ADMINISTRATIVE" && scope !== "CLINICAL")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Camada inválida",
          });
        const result = await uploadPrivateDocument(res.locals.user, {
          patientId,
          title: decodeURIComponent(
            String(req.headers["x-document-title"] || "")
          ),
          fileName: decodeURIComponent(
            String(req.headers["x-file-name"] || "")
          ),
          scope,
          mimeType: String(req.headers["content-type"]),
          data: req.body,
        });
        res.set("Cache-Control", "no-store");
        res.status(201).json(result);
      } catch (error) {
        replyError(res, error);
      }
    }
  );
  app.get("/api/private-documents/:id/download", async (req, res) => {
    try {
      const user = await authenticate(req);
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) return missing();
      const file = await downloadPrivateDocument(user, id);
      res.set({
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
      });
      res.send(file.data);
    } catch (error) {
      replyError(res, error);
    }
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) =>
    replyError(res, error);
  app.use("/api/private-documents", errors);
}
