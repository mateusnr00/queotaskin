// Regressão dos escudos dos times de CS2.
//
// Os 46 times têm escudo (Team.escudo); quase todos apontam para o CDN da
// HLTV (img-cdn.hltv.org) e alguns para o Storage do Supabase. O emblema
// (EmblemaDoTime) desenha a imagem quando há escudo e cai na TAG quando não há
// ou a imagem falha. O que fez "os logos sumirem" foi o CSP: o img-src não
// listava o host da HLTV, então o navegador bloqueava TODO escudo e o emblema
// caía sempre na TAG.
//
// Este teste prova as duas pontas: (1) o escudo com host da HLTV volta inteiro
// pelo catálogo, e (2) o CSP de produção agora libera esse host — sem virar um
// img-src permissivo. Time sem escudo volta nulo (fallback de TAG, sem imagem
// quebrada).
import { afterAll, beforeAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { securityHeaders } from "@/lib/security-headers";

function imgSrc(): string {
  const csp = securityHeaders(true).find((h) => h.key === "Content-Security-Policy")!.value;
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("img-src"))!;
}

// Invariante de CSP (não precisa de banco): o host da HLTV está liberado, e o
// img-src continua restritivo (nada de curinga total).
it("CSP libera o CDN da HLTV sem abrir o img-src para tudo", () => {
  const src = imgSrc();
  expect(src).toContain("https://img-cdn.hltv.org");
  expect(src).toContain("https://*.supabase.co"); // escudos enviados pelo admin
  expect(src).not.toContain("img-src *");
  expect(src).not.toMatch(/\bimg-src[^;]*\shttps:\s/); // sem "https:" solto (qualquer host)
});

suiteDeIntegracao("Escudos dos times · catálogo", () => {
  const ids: string[] = [];

  async function criarTime(escudo: string | null): Promise<string> {
    const id = `teste-${Math.random().toString(36).slice(2, 9)}`;
    await prisma.team.create({
      data: {
        id, nome: `Time ${id}`, tag: "TST", cor: "#1f2937", regiao: "INTER",
        escudo, ordem: 9999, ativo: true,
      },
    });
    ids.push(id);
    return id;
  }

  beforeAll(() => { if (!integracaoLiberada) return; });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.team.deleteMany({ where: { id: { in: ids } } });
  });

  it("time COM escudo HLTV volta inteiro, e o host está liberado no CSP", async () => {
    const escudo = "https://img-cdn.hltv.org/teamlogo/exemploTeste123.png";
    const id = await criarTime(escudo);
    const time = await prisma.team.findUnique({ where: { id }, select: { escudo: true } });
    expect(time?.escudo).toBe(escudo);
    // o host do escudo é um que o CSP permite -> a imagem carrega no navegador
    const host = new URL(escudo).origin; // https://img-cdn.hltv.org
    expect(imgSrc()).toContain(host);
  });

  it("time SEM escudo volta nulo (emblema cai na TAG, sem imagem quebrada)", async () => {
    const id = await criarTime(null);
    const time = await prisma.team.findUnique({ where: { id }, select: { escudo: true } });
    expect(time?.escudo).toBeNull();
  });
});
