// O SELETOR DE QUANTIDADE NÃO PODE VOLTAR A MUDAR SOZINHO.
//
// Nenhuma linha deste projeto ouvia a roda do mouse: quem mexia no valor era
// o navegador, que incrementa e decrementa um `input type="number"` focado
// quando a página rola por cima dele. No telefone isso virava quantidade
// trocada ao rolar a página com o dedo em cima do campo.
//
// Um teste de fonte, e não de DOM, porque o projeto não tem ambiente de DOM
// montado: o que precisa ser barrado é o `type="number"` reaparecendo num
// seletor de quantidade, e isso se lê no código.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FORMULARIO = path.join(
  process.cwd(),
  "src/components/public/reservation-form.tsx",
);
const fonte = readFileSync(FORMULARIO, "utf8");

/** Só o corpo do seletor, para não julgar o resto do formulário. */
function corpoDoSeletor(): string {
  const i = fonte.indexOf("function QuantityPicker(");
  const j = fonte.indexOf("function ManualPicker(", i);
  expect(i).toBeGreaterThan(-1);
  return fonte.slice(i, j);
}

describe("o seletor de quantidade", () => {
  const seletor = corpoDoSeletor();

  it("não usa input numérico, que é o que a roda do mouse mexe", () => {
    expect(seletor).not.toContain('type="number"');
    expect(seletor).toContain('inputMode="numeric"');
  });

  it("não escuta roda nem gesto de rolagem", () => {
    for (const gesto of ["onWheel", "onScroll", "wheel", "touchmove"]) {
      expect(seletor).not.toContain(gesto);
    }
  });

  it("não tem mais o botão de limpar seleção", () => {
    expect(seletor).not.toContain("Limpar seleção");
    expect(seletor).not.toMatch(/<X\b/);
  });

  it("os dois botões dizem o que fazem, para quem não vê o ícone", () => {
    expect(seletor).toContain('aria-label="Diminuir quantidade"');
    expect(seletor).toContain('aria-label="Aumentar quantidade"');
  });

  it("o desabilitado é de verdade, e não só uma cor mais fraca", () => {
    expect(seletor).toContain("disabled={quantity <= limites.min}");
    expect(seletor).toContain("disabled={quantity >= limites.max}");
  });

  it("os dois botões têm a mesma caixa, para o valor ficar no meio", () => {
    const botoes = seletor.match(/className="h-11 w-11 shrink-0"/g) ?? [];
    expect(botoes).toHaveLength(2);
  });

  // A roda do navegador só age em campo numérico. Se um aparecer em qualquer
  // seletor de quantidade do site, este teste é quem avisa.
  it("nenhum outro seletor de quantidade do público usa input numérico", () => {
    const publicos = [
      "src/components/public/reservation-form.tsx",
      "src/components/public/surprise-boxes-claim.tsx",
    ];
    for (const rel of publicos) {
      const arquivo = path.join(process.cwd(), rel);
      let conteudo = "";
      try {
        conteudo = readFileSync(arquivo, "utf8");
      } catch {
        continue;
      }
      if (!/Minus|quantidade|quantity/i.test(conteudo)) continue;
      expect(conteudo, rel).not.toContain('type="number"');
    }
  });
});
