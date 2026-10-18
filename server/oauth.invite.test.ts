import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { registerOAuthRoutes } from "./_core/oauth";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { OAUTH_STATE_COOKIE } from "../shared/const";
import type { Express, Request, Response } from "express";

describe("retorno ao convite após OAuth", () => {
  beforeEach(() => {
    vi.spyOn(sdk, "exchangeCodeForToken").mockResolvedValue({
      accessToken: "teste",
    } as never);
    vi.spyOn(sdk, "getUserInfo").mockResolvedValue({
      openId: "convidado",
      name: "Convidado",
      email: "demo@example.com",
    } as never);
    vi.spyOn(sdk, "createSessionToken").mockResolvedValue(
      "sessao-local-ficticia"
    );
    vi.spyOn(db, "upsertUser").mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());
  async function callback(returnTo: string, validNonce = true) {
    let handler: (req: Request, res: Response) => Promise<void>;
    registerOAuthRoutes({
      get: (_path: string, fn: typeof handler) => {
        handler = fn;
      },
    } as unknown as Express);
    const req = {
      query: {
        code: "codigo-teste",
        state: btoa(
          JSON.stringify({
            redirectUri: "https://clinic.example/api/oauth/callback",
            nonce: "nonce-teste",
            returnTo,
          })
        ),
      },
      headers: {
        cookie: `${OAUTH_STATE_COOKIE}=${validNonce ? "nonce-teste" : "outro-nonce"}`,
      },
      protocol: "https",
    } as unknown as Request;
    const res = {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    await handler!(req, res as unknown as Response);
    return res;
  }
  it("retorna ao convite depois de autenticar com nonce correto", async () => {
    expect((await callback("/invite")).redirect).toHaveBeenCalledWith(
      302,
      "/invite"
    );
  });
  it("recusa redirecionamento externo e volta à rota principal", async () => {
    expect(
      (await callback("https://outside.example")).redirect
    ).toHaveBeenCalledWith(302, "/");
  });
  it("não troca o código OAuth se o navegador não possui o nonce correto", async () => {
    expect((await callback("/invite", false)).status).toHaveBeenCalledWith(403);
    expect(sdk.exchangeCodeForToken).not.toHaveBeenCalled();
  });
});
