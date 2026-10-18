import { writeFile } from "node:fs/promises";
import "dotenv/config";
await writeFile(
  "dist/build-info.json",
  JSON.stringify({
    appId: process.env.VITE_APP_ID || "",
    oauthPortal: process.env.VITE_OAUTH_PORTAL_URL || "",
  })
);
