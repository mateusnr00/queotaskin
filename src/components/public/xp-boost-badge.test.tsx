// A insígnia, renderizada de verdade.
//
// Renderiza para string com `react-dom/server`, que já vem com o Next: dá
// para conferir a geometria e as props sem trazer uma biblioteca de teste de
// componente só para isto.
//
// O que interessa provar é que É UM COMPONENTE SÓ. Nove multiplicadores, três
// tamanhos e qualquer cor saem do mesmo desenho, com os mesmos dois caminhos
// de SVG. Se alguém um dia criar um `Xp35Badge` à parte, estes testes
// continuam passando e o de baixo, o da geometria idêntica, quebra.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { XpBoostBadge } from "./xp-boost-badge";
import { DROPS_PADRAO } from "@/lib/xp/caixa-de-level-up";

function render(props: Parameters<typeof XpBoostBadge>[0]): string {
  return renderToStaticMarkup(<XpBoostBadge {...props} />);
}

/** Os dois caminhos do desenho aprovado, exatamente como foram entregues. */
const CONTORNO = "M55 309 L26 287 L26 116 L160 15 L294 116 L294 287 L265 309";
const SETA = "M72 158 L160 92 L248 158 L248 207 L160 142 L72 207 Z";

describe("XpBoostBadge", () => {
  const MULTIPLICADORES = [1.5, 1.7, 2.0, 2.2, 2.5, 2.7, 3.0, 3.2, 3.5];

  it.each(MULTIPLICADORES)("desenha o multiplicador %sx", (m) => {
    const html = render({ multiplier: m, color: "#FF4655" });
    // O número aparece sem zero pendurado: 2.0 vira "2".
    const esperado = Number.isInteger(m) ? String(m) : String(m);
    expect(html).toContain(esperado);
    expect(html).toContain("XP");
  });

  it("todos os nove usam a MESMA geometria", () => {
    // A prova de que é um componente só, e não nove.
    for (const m of MULTIPLICADORES) {
      const html = render({ multiplier: m, color: "#FFFFFF" });
      expect(html).toContain(CONTORNO);
      expect(html).toContain(SETA);
    }
  });

  it("a cor vem da prop, e não da raridade", () => {
    // O mesmo multiplicador em duas cores diferentes: nada no componente
    // decide cor por conta própria.
    expect(render({ multiplier: 3.5, color: "#FF4655" })).toContain("#FF4655");
    expect(render({ multiplier: 3.5, color: "#3B82F6" })).toContain("#3B82F6");
  });

  it("as cores da tabela padrão atravessam intactas", () => {
    for (const drop of DROPS_PADRAO) {
      const html = render({ multiplier: drop.multiplier, color: drop.color });
      expect(html).toContain(drop.color);
    }
  });

  it("os três tamanhos mudam a largura e mantêm a proporção", () => {
    const larguras = (["sm", "md", "lg"] as const).map((size) => {
      const html = render({ multiplier: 2.5, color: "#FFF", size });
      const w = Number(/width="(\d+)"/.exec(html)?.[1]);
      const h = Number(/height="([\d.]+)"/.exec(html)?.[1]);
      // A proporção do viewBox aprovado, 320 por 360.
      expect(h / w).toBeCloseTo(360 / 320, 5);
      return w;
    });
    expect(larguras[0]!).toBeLessThan(larguras[1]!);
    expect(larguras[1]!).toBeLessThan(larguras[2]!);
  });

  it("o viewBox é o do desenho aprovado", () => {
    expect(render({ multiplier: 2, color: "#FFF" })).toContain('viewBox="0 0 320 360"');
  });

  it("não desenha nada além do contorno, da seta e do texto", () => {
    // A trava contra segunda seta, círculo, hexágono, estrela ou moldura
    // extra entrando sem ninguém perceber.
    const html = render({ multiplier: 2.5, color: "#FFF" });
    expect((html.match(/<path/g) ?? []).length).toBe(2);
    expect(html).not.toContain("<circle");
    expect(html).not.toContain("<rect");
    expect(html).not.toContain("<polygon");
    expect((html.match(/<text/g) ?? []).length).toBe(2);
  });

  it("decorativo some do leitor de tela; o normal se anuncia", () => {
    expect(render({ multiplier: 2.5, color: "#FFF", decorativo: true })).toContain(
      'aria-hidden="true"',
    );
    expect(render({ multiplier: 2.5, color: "#FFF" })).toContain(
      'aria-label="Boost de 2.5x XP"',
    );
  });
});
