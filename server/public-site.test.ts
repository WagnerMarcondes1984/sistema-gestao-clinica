import { describe, it, expect } from "vitest";
import {
  defaultSite,
  siteContent,
  brandForeground,
  parseSite,
} from "../shared/public-site";
import { renderSite } from "./public-site-http";
describe("contrato e renderização pública do CMS", () => {
  it("rejeita HTML/CSS/URLs executáveis nos campos estruturais e campos privados", () => {
    const c = defaultSite("Clínica fictícia");
    expect(siteContent.safeParse({ ...c, patientId: 1 }).success).toBe(false);
    expect(
      siteContent.safeParse({
        ...c,
        brand: { ...c.brand, primary: "red;background:url(javascript:1)" },
      }).success
    ).toBe(false);
    for (const publicOrigin of [
      "javascript:alert(1)",
      "https://" + "a".repeat(300) + ".example.com",
      "http://example.com",
      "https://u:p@example.com",
      "https://example.com/private?q=1",
    ]) {
      expect(
        siteContent.safeParse({ ...c, seo: { ...c.seo, publicOrigin } }).success
      ).toBe(false);
    }
  });
  it("escapa texto, atributos e JSON-LD sem executar conteúdo editorial", () => {
    const c = defaultSite("Clínica <script>alert(1)</script>");
    c.seo.title = 'Título " <img src=x onerror=alert(1)>';
    c.blocks[0].body = "</script><script>alert(1)</script>";
    c.blocks.push({
      ...c.blocks[0],
      id: "00000000-0000-4000-8000-000000000002",
      kind: "FAQ",
      items: [
        {
          title: "</script><script>alert(2)</script>",
          body: "Resposta & texto",
        },
      ],
    });
    const html = renderSite(c, "clinica-ficticia");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("\\u003c/script");
    expect(html).toContain("/book?clinic=clinica-ficticia");
    expect(html).not.toContain("patientId");
  });
  it("publica somente blocos habilitados, permite desativar atalhos e não inventa canonical", () => {
    const c = defaultSite("Clínica fictícia");
    c.blocks[0].enabled = false;
    c.blocks[0].body = "Trecho oculto";
    c.bookingEnabled = false;
    c.portalEnabled = false;
    const html = renderSite(c, "clinica");
    expect(html).not.toContain("Trecho oculto");
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('href="/portal"');
    expect(html).not.toContain("/book?");
  });
  it("marca a prévia como privada e deriva canonical somente da origem validada", () => {
    const c = defaultSite("Clínica fictícia");
    c.seo.publicOrigin = "https://clinica.example.com";
    expect(renderSite(c, "clinica")).toContain(
      "https://clinica.example.com/site/clinica"
    );
    expect(renderSite(c, "clinica", true)).toContain("noindex,nofollow");
    expect(renderSite(c, "clinica", true)).not.toContain('rel="canonical"');
  });
  it("distingue legado de conteúdo válido e escolhe texto contrastante para marca", () => {
    expect(parseSite('{"title":"Legado"}')).toBeNull();
    expect(
      parseSite(JSON.stringify(defaultSite("Clínica fictícia")))
    ).not.toBeNull();
    expect(brandForeground("#ffffff")).toBe("#000000");
    expect(brandForeground("#000000")).toBe("#ffffff");
  });
});
