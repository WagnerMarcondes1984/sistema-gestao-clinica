import { HttpError } from "../shared/_core/errors";
import type { Express, Response } from "express";
import { TRPCError } from "@trpc/server";
import { sdk } from "./_core/sdk";
import { withClinic } from "./scheduling";
import { publicSite } from "./public-site";
import { and, eq } from "drizzle-orm";
import { mindosCmsVersions } from "../drizzle/schema";
import {
  brandForeground,
  parseSite,
  siteId,
  type SiteContent,
} from "../shared/public-site";
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
const jsonLd = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
const css = `*{box-sizing:border-box}body{overflow-wrap:anywhere;margin:0;font-family:system-ui,sans-serif;line-height:1.65;color:#172033;background:#f8fafc}a{color:inherit}header,footer,main{max-width:1100px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:18px;align-items:center;flex-wrap:wrap}nav{display:flex;gap:16px;flex-wrap:wrap}.brand{overflow-wrap:anywhere;font-weight:750;font-size:1.2rem}.logo{display:inline-block;background:var(--primary);color:var(--foreground);padding:6px 10px;border-radius:12px;margin-right:10px}section{padding:36px clamp(18px,4vw,44px);background:white;border:1px solid #e2e8f0;border-radius:24px;margin-bottom:22px}h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.15}h2{line-height:1.3}p{white-space:pre-wrap;overflow-wrap:anywhere}h1,h2,h3{overflow-wrap:anywhere}.hero{border-top:7px solid var(--primary)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:20px}.item{border-left:3px solid var(--accent);padding:0 16px}.button{display:inline-block;background:var(--primary);color:var(--foreground);padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700}.preview{background:#fef3c7;color:#713f12;padding:16px;text-align:center}details{border-bottom:1px solid #ddd;padding:14px 0}summary{cursor:pointer;font-weight:650}a:focus-visible,summary:focus-visible{outline:3px solid #111;outline-offset:4px}footer{font-size:.9rem;color:#475569}`;
export function renderSite(
  content: SiteContent,
  slug: string,
  preview = false
) {
  const e = escapeHtml,
    c = content,
    book = `/book?clinic=${encodeURIComponent(slug)}`,
    canonical = c.seo.publicOrigin
      ? `${new URL(c.seo.publicOrigin).origin}/site/${slug}`
      : "";
  const faq = c.blocks
    .filter(b => b.enabled && b.kind === "FAQ")
    .flatMap(b => b.items)
    .filter(i => i.title && i.body);
  const structured: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: c.brand.name,
      ...(canonical ? { url: canonical } : {}),
      ...(c.contact.city
        ? {
            address: {
              "@type": "PostalAddress",
              addressLocality: c.contact.city,
              streetAddress: c.contact.address,
            },
          }
        : {}),
      ...(c.contact.email ? { email: c.contact.email } : {}),
    },
  ];
  if (faq.length)
    structured.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(i => ({
        "@type": "Question",
        name: i.title,
        acceptedAnswer: { "@type": "Answer", text: i.body },
      })),
    });
  const contact = [
    c.contact.address,
    c.contact.city,
    c.contact.email,
    c.contact.phone,
  ]
    .filter(Boolean)
    .map(s => `<p>${e(s)}</p>`)
    .join("");
  const blocks = c.blocks
    .filter(b => b.enabled)
    .map(
      (b, index) =>
        `<section class="${b.kind === "HERO" ? "hero" : ""}" aria-label="${e(b.title || b.kind)}">${b.title ? `<${index === 0 ? "h1" : "h2"}>${e(b.title)}</${index === 0 ? "h1" : "h2"}>` : ""}${b.body ? `<p>${e(b.body)}</p>` : ""}${b.kind === "FAQ" ? b.items.map(i => `<details><summary>${e(i.title)}</summary><p>${e(i.body)}</p></details>`).join("") : `<div class="grid">${b.items.map(i => `<article class="item"><h3>${e(i.title)}</h3><p>${e(i.body)}</p></article>`).join("")}</div>`}${b.kind === "LOCATION" ? contact : ""}${(b.kind === "HERO" || b.kind === "CTA") && c.bookingEnabled ? `<a class="button" href="${e(book)}">Solicitar um horário</a>` : ""}</section>`
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(c.seo.title)}</title><meta name="description" content="${e(c.seo.description)}"><meta property="og:title" content="${e(c.seo.title)}"><meta property="og:description" content="${e(c.seo.description)}"><meta property="og:type" content="website">${preview ? '<meta name="robots" content="noindex,nofollow">' : canonical ? `<link rel="canonical" href="${e(canonical)}"><meta property="og:url" content="${e(canonical)}">` : ""}<style>:root{--primary:${c.brand.primary};--accent:${c.brand.accent};--foreground:${brandForeground(c.brand.primary)}}${css}</style><script type="application/ld+json">${jsonLd(structured)}</script></head><body>${preview ? '<div class="preview">PRÉVIA PRIVADA — conteúdo ainda não publicado. Esta visualização não altera o site público.</div>' : ""}<header><div class="brand">${c.brand.logoText ? `<span class="logo">${e(c.brand.logoText)}</span>` : ""}${e(c.brand.name)}</div><nav aria-label="Acesso da clínica">${c.bookingEnabled ? `<a href="${e(book)}">Agendamento</a>` : ""}${c.portalEnabled ? '<a href="/portal">Portal do paciente</a>' : ""}</nav></header><main>${blocks}</main><footer>${e(c.brand.name)}${c.contact.city ? ` · ${e(c.contact.city)}` : ""}</footer></body></html>`;
}
function headers(res: Response, preview = false) {
  res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    ...(preview ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
  });
}
function errorPage(res: Response, error: unknown) {
  const status =
    error instanceof HttpError && [401, 403].includes(error.statusCode)
      ? error.statusCode
      : error instanceof TRPCError
        ? error.code === "NOT_FOUND"
          ? 404
          : error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED"
            ? 403
            : error.code === "PRECONDITION_FAILED"
              ? 503
              : 400
        : 500;
  headers(res, true);
  res
    .status(status)
    .type("html")
    .send(
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Site indisponível</title><h1>Site indisponível</h1><p>O conteúdo não está publicado ou este acesso não está autorizado.</p></html>'
    );
}
export function registerPublicSite(app: Express) {
  app.get(["/site/:slug/llms.txt", "/site/llms.txt"], async (req, res) => {
    try {
      const p = await publicSite(req.params.slug);
      headers(res);
      res.type("text/plain").send(
        `# ${p.content.brand.name}\n\n${p.content.seo.description}\n\n` +
          p.content.blocks
            .filter(b => b.enabled)
            .map(
              b =>
                `## ${b.title}\n${b.body}\n` +
                b.items.map(i => `${i.title}\n${i.body}`).join("\n")
            )
            .join("\n\n")
      );
    } catch (e) {
      errorPage(res, e);
    }
  });
  app.get(["/site/:slug", "/site"], async (req, res) => {
    try {
      const p = await publicSite(req.params.slug);
      headers(res);
      res.type("html").send(renderSite(p.content, p.slug));
    } catch (e) {
      errorPage(res, e);
    }
  });
  app.get("/api/site-preview/:id", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const parsedId = siteId.safeParse(Number(req.params.id));
      if (!parsedId.success)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Identificador inválido",
        });
      const id = parsedId.data;
      const preview = await withClinic(
        user,
        "VIEW_PUBLIC_SITE",
        async (tx, c) => {
          const [v] = await tx
            .select()
            .from(mindosCmsVersions)
            .where(
              and(
                eq(mindosCmsVersions.id, id),
                eq(mindosCmsVersions.tenantId, c.id)
              )
            );
          const content = v && parseSite(v.contentJson);
          if (!content)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Prévia indisponível",
            });
          return { content, slug: c.slug };
        }
      );
      headers(res, true);
      res.type("html").send(renderSite(preview.content, preview.slug, true));
    } catch (e) {
      errorPage(res, e);
    }
  });
}
