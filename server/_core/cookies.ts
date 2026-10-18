import type { CookieOptions, Request } from "express";

import { liveDeployment } from "../runtime-config";
export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const secure = liveDeployment() || req.protocol === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
