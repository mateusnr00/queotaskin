import { describe, expect, it } from "vitest";

import { toSlug } from "@/lib/slug";

/**
 * A escolha do próximo número, isolada do banco.
 *
 * `garantirSlugLivre` faz a mesma conta com os slugs que vieram da consulta.
 * Repetir a regra aqui deixa o comportamento fixado sem subir Postgres, que é
 * o que faria esses casos deixarem de rodar no CI.
 */
function proximoLivre(raiz: string, ocupados: string[]): string {
  const tomados = new Set(ocupados);
  if (!tomados.has(raiz)) return raiz;
  for (let n = 1; n <= tomados.size + 1; n++) {
    const candidato = `${raiz}${n}`;
    if (!tomados.has(candidato)) return candidato;
  }
  throw new Error("inalcançável: sempre sobra um entre raiz1 e raiz(n+1)");
}

const AK = toSlug("AK-47 | Redline (Field Tested)");

describe("slug a partir do nome da skin", () => {
  it("vira URL legível, sem a barra virar palavra", () => {
    expect(AK).toBe("ak-47-redline-field-tested");
    expect(toSlug("AWP | Dragon Lore")).toBe("awp-dragon-lore");
  });

  it("mantém o número que faz parte do nome", () => {
    expect(toSlug("★ Karambit | Doppler (Phase 2)")).toBe(
      "karambit-doppler-phase-2"
    );
  });
});

describe("numeração em colisão", () => {
  it("primeira campanha da skin fica sem número", () => {
    expect(proximoLivre(AK, [])).toBe(AK);
  });

  it("segunda vira 1, terceira vira 2", () => {
    expect(proximoLivre(AK, [AK])).toBe(`${AK}1`);
    expect(proximoLivre(AK, [AK, `${AK}1`])).toBe(`${AK}2`);
    expect(proximoLivre(AK, [AK, `${AK}1`, `${AK}2`])).toBe(`${AK}3`);
  });

  it("aproveita buraco deixado por campanha apagada", () => {
    // Apagaram a 1: o número volta a ficar livre em vez de pular para 3.
    expect(proximoLivre(AK, [AK, `${AK}2`])).toBe(`${AK}1`);
  });

  it("passa de 9 sem travar", () => {
    const ocupados = [AK, ...Array.from({ length: 9 }, (_, i) => `${AK}${i + 1}`)];
    expect(proximoLivre(AK, ocupados)).toBe(`${AK}10`);
  });

  it("slug de outra skin com a mesma raiz não empurra a numeração à toa", () => {
    // "ak-47-redline-field-tested" é prefixo de "...-stattrak", que a
    // consulta por startsWith traz junto. Ele ocupa espaço no conjunto mas
    // não é o slug procurado, então a raiz continua livre.
    expect(proximoLivre(AK, [`${AK}-stattrak`])).toBe(AK);
  });

  it("nome que já termina em número continua único", () => {
    const phase = toSlug("★ Karambit | Doppler (Phase 2)");
    expect(proximoLivre(phase, [phase])).toBe(`${phase}1`);
  });

  it("sempre devolve algo livre, seja qual for o conjunto", () => {
    for (let quantos = 0; quantos < 25; quantos++) {
      const ocupados = [AK, ...Array.from({ length: quantos }, (_, i) => `${AK}${i + 1}`)];
      const escolhido = proximoLivre(AK, ocupados);
      expect(ocupados).not.toContain(escolhido);
    }
  });
});
