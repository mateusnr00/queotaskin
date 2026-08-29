import { describe, expect, it } from "vitest";

import {
  TIMES_DE_CS2,
  timeExiste,
  timePorId,
  timesPorRegiao,
  textoSobreACor,
  contraste,
} from "@/lib/times-cs2";

describe("times de CS2", () => {
  it("não tem id repetido", () => {
    // Id repetido faria o segundo time ser inalcançável pelo mapa, e a pessoa
    // escolheria um e veria o outro ao lado do próprio nome.
    const ids = TIMES_DE_CS2.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo id é slug: minúsculas, dígitos e hífen", () => {
    // O id vai para o banco e para a URL de um escudo. Maiúscula ou espaço ali
    // vira dor depois, e é barato proibir agora.
    for (const t of TIMES_DE_CS2) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("toda cor é hex de seis dígitos", () => {
    // A cor entra direto num style inline. Valor quebrado não dá erro: o
    // navegador ignora e o emblema fica transparente, sem aviso nenhum.
    for (const t of TIMES_DE_CS2) {
      expect(t.cor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("toda tag cabe no emblema", () => {
    // O emblema corta em quatro. Tag maior sairia truncada de um jeito que
    // ninguém escolheu.
    for (const t of TIMES_DE_CS2) {
      expect(t.tag.length).toBeGreaterThanOrEqual(2);
      expect(t.tag.length).toBeLessThanOrEqual(4);
    }
  });

  it("id desconhecido não quebra, devolve nulo", () => {
    // É o caso real: um time sai da lista e sobra o id na conta de quem
    // torcia. Sem chave estrangeira, o banco não impede, então quem impede é
    // esta função.
    expect(timePorId("time-que-nao-existe")).toBeNull();
    expect(timePorId(null)).toBeNull();
    expect(timePorId(undefined)).toBeNull();
    expect(timePorId("")).toBeNull();
  });

  it("acha quem existe", () => {
    expect(timePorId("furia")?.nome).toBe("FURIA");
    expect(timeExiste("furia")).toBe(true);
    expect(timeExiste("FURIA")).toBe(false);
  });

  it("as duas regiões somam a lista inteira", () => {
    const { br, inter } = timesPorRegiao();
    expect(br.length + inter.length).toBe(TIMES_DE_CS2.length);
    expect(br.length).toBeGreaterThan(0);
    expect(inter.length).toBeGreaterThan(0);
  });

  it("nenhum escudo apontando para host de terceiro", () => {
    // O campo nasce vazio, e quando for preenchido precisa apontar para o
    // Storage do site. Puxar de raw.githubusercontent quebra na primeira vez
    // que o repositório de lá some, e exige liberar o host no next.config.
    for (const t of TIMES_DE_CS2) {
      if (!t.escudo) continue;
      expect(t.escudo).not.toMatch(/githubusercontent|github\.com/);
    }
  });
});

describe("textoSobreACor", () => {
  it("escolhe preto em fundo claro e branco em fundo escuro", () => {
    expect(textoSobreACor("#facc15")).toBe("#111827"); // amarelo da NAVI
    expect(textoSobreACor("#ffffff")).toBe("#111827");
    expect(textoSobreACor("#111827")).toBe("#ffffff"); // preto da FURIA
    expect(textoSobreACor("#000000")).toBe("#ffffff");
  });

  it("acerta no meio da escala, onde um corte fixo erra", () => {
    // O ciano do Fluxo. Um corte de luminância em 0,45 mandava branco aqui e
    // entregava 3,68:1, quando preto no mesmo fundo passa de 4,5:1.
    expect(textoSobreACor("#0891b2")).toBe("#111827");
  });

  it("todo time da lista alcança 4.5:1 com a cor de texto escolhida", () => {
    // O emblema carrega a TAG, e a TAG é a identidade do time enquanto não
    // houver escudo. Ilegível ali é o mesmo que vazio. 4,5:1 e não 3:1 porque
    // o texto é pequeno: 7px a 11px, longe do "texto grande" da WCAG.
    for (const t of TIMES_DE_CS2) {
      const razao = contraste(t.cor, textoSobreACor(t.cor));
      expect(razao, `${t.nome} (${t.cor})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("a razão de contraste bate com valores conhecidos", () => {
    // Sem isto, um erro na fórmula passaria despercebido: o teste acima só
    // pergunta se o número é grande, não se ele está certo.
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});
