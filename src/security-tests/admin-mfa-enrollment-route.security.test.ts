// REGRESSÃO: loop de redirect no enrollment inicial de MFA do admin.
//
// Bug (SHA 318b3de): no host do painel (admin.*), o proxy (src/proxy.ts) só
// deixa passar os CAMINHOS_DO_PAINEL; qualquer outro caminho é tratado como
// endereço público e redirecionado para /admin. A rota de bootstrap de MFA
// `/configurar-mfa` NÃO estava na lista, então:
//
//   /configurar-mfa --(proxy: não é do painel)--> /admin
//   /admin          --(requireAdmin: admin sem MFA)--> /configurar-mfa
//   ...loop infinito ("Redireções em excesso" no Safari).
//
// A página foi deliberadamente posta FORA do grupo (admin) para não herdar o
// requireAdmin do layout, mas faltou liberá-la no proxy. Este teste fixa o
// contrato do proxy: /configurar-mfa é caminho do painel e NUNCA volta pra si
// mesma nem para /admin no host admin.
import { describe, it, expect, vi } from "vitest";

// auth(handler) do NextAuth vira identidade: o default export do proxy passa a
// ser o próprio handler, que chamamos direto com um request sintético.
vi.mock("next-auth", () => ({ default: vi.fn(() => ({ auth: (h: unknown) => h })) }));

// NextResponse sem runtime edge: sentinelas simples + construtor pro 404.
vi.mock("next/server", () => {
  class NextResponse {
    body: unknown;
    status: number;
    tipo = "raw";
    constructor(body?: unknown, init?: { status?: number }) {
      this.body = body ?? null;
      this.status = init?.status ?? 200;
    }
    static next() {
      return { tipo: "next", status: 200 };
    }
    static redirect(url: URL | string) {
      return { tipo: "redirect", location: String(url), status: 307 };
    }
  }
  return { NextResponse };
});

import proxy from "@/proxy";

type Resp =
  | { tipo: "next"; status: number }
  | { tipo: "redirect"; location: string; status: number }
  | { tipo: "raw"; status: number };

function requisicao(host: string, path: string, auth?: unknown) {
  const nextUrl = new URL(`https://${host}${path}`);
  const headers = new Headers({ host, "x-forwarded-proto": "https" });
  return { nextUrl, headers, url: nextUrl.toString(), auth };
}

async function rota(host: string, path: string, auth?: unknown): Promise<Resp> {
  const fn = proxy as unknown as (req: unknown) => Resp | Promise<Resp>;
  return (await fn(requisicao(host, path, auth))) as Resp;
}

const ADMIN = "admin.queotaskin.com";
const PUBLICO = "queotaskin.com";
const adminLogado = { user: { id: "a1", role: "ADMIN" } };

describe("proxy: enrollment de MFA no host admin (regressão do loop)", () => {
  it("CASO 1/7: /configurar-mfa no host admin é SERVIDO, não redireciona (nem pra /admin, nem pra si mesma)", async () => {
    const r = await rota(ADMIN, "/configurar-mfa", adminLogado);
    // O bug produzia { tipo: "redirect", location: ".../admin" } aqui.
    expect(r.tipo).toBe("next");
    // Contrato explícito: se um dia virar redirect, nunca pode apontar pro loop.
    if (r.tipo === "redirect") {
      expect(r.location).not.toContain("/configurar-mfa");
      expect(r.location).not.toMatch(/\/admin(\/|$)/);
    }
  });

  it("CASO 8: host admin preserva o roteamento correto das demais rotas", async () => {
    expect((await rota(ADMIN, "/admin", adminLogado)).tipo).toBe("next");
    expect((await rota(ADMIN, "/admin/usuarios", adminLogado)).tipo).toBe("next");
    expect((await rota(ADMIN, "/login")).tipo).toBe("next");
    expect((await rota(ADMIN, "/trocar-senha", adminLogado)).tipo).toBe("next");
    expect((await rota(ADMIN, "/api/health")).tipo).toBe("next");

    // /registro no painel vai pra /login (conta de admin não é auto-serviço).
    const reg = await rota(ADMIN, "/registro");
    expect(reg.tipo).toBe("redirect");
    if (reg.tipo === "redirect") expect(reg.location).toContain("/login");

    // Caminho desconhecido no painel continua indo pra /admin.
    const qualquer = await rota(ADMIN, "/qualquer-coisa", adminLogado);
    expect(qualquer.tipo).toBe("redirect");
    if (qualquer.tipo === "redirect") expect(qualquer.location).toMatch(/\/admin$/);
  });

  it("CASO 7: /configurar-mfa nunca é redirecionada para ela própria (nenhum host)", async () => {
    for (const host of [ADMIN, PUBLICO]) {
      const r = await rota(host, "/configurar-mfa", adminLogado);
      if (r.tipo === "redirect") expect(r.location).not.toContain("/configurar-mfa");
    }
  });

  it("host público: /admin* responde 404 (painel não é anunciado)", async () => {
    const r = await rota(PUBLICO, "/admin");
    expect(r.tipo).toBe("raw");
    expect(r.status).toBe(404);
  });
});
