import { describe, expect, it } from "vitest";

import {
  agendarSaida,
  compraCasaComSaida,
  porcentagemDaSaida,
  premioDaVez,
  type Saida,
} from "@/lib/saida";

const SAIDA: Saida = {
  tipo: "PROGRESSO",
  emTitulos: null,
  titulosDe: null,
  titulosAte: null,
  dataDe: null,
  dataAte: null,
  ddds: [],
};
const progresso = (emTitulos: number): Saida => ({ ...SAIDA, emTitulos });
const personalizado = (p: Partial<Saida>): Saida => ({
  ...SAIDA,
  tipo: "PERSONALIZADO",
  ...p,
});
const COMPRA = {
  titulos: 10,
  quando: new Date("2026-08-30T12:00:00Z"),
  ddd: "62",
};

describe("agendarSaida", () => {
  it("campanha em 0% agenda o prêmio para sair cedo", () => {
    // O pedido: "se o sorteio está em zero, ele já vem para sair nos zero por
    // cento, para sair rápido". Com sorteio em 0 ele cai no primeiro título.
    expect(
      agendarSaida({ vendidos: 0, total: 100, ultimoAgendado: null }, 0),
    ).toBe(1);
    // E mesmo no pior acaso não passa dos quinze por cento do que falta.
    expect(
      agendarSaida({ vendidos: 0, total: 100, ultimoAgendado: null }, 0.99),
    ).toBeLessThanOrEqual(16);
  });

  it("campanha em 80% agenda proporcional ao que ainda falta", () => {
    // "Após algumas vendas e aí ele sair." Sobram 20 títulos, então a janela é
    // de três: o prêmio sai logo adiante, e não lá no fim.
    const p = agendarSaida(
      { vendidos: 80, total: 100, ultimoAgendado: null },
      0.5,
    );
    expect(p).toBeGreaterThan(80);
    expect(p).toBeLessThanOrEqual(84);
  });

  it("nunca agenda atrás da venda atual", () => {
    // Nascer vencido faria o prêmio sair na primeira caixa, sem critério
    // nenhum, que é o contrário de agendar.
    for (const s of [0, 0.3, 0.7, 0.99]) {
      expect(
        agendarSaida({ vendidos: 55, total: 100, ultimoAgendado: null }, s),
      ).toBeGreaterThan(55);
    }
  });

  it("um atrás do outro: nunca antes de um prêmio já agendado", () => {
    // Sem isto, dois prêmios cadastrados em sequência cairiam no mesmo ponto e
    // sairiam juntos na mesma caixa.
    const primeiro = agendarSaida(
      { vendidos: 0, total: 100, ultimoAgendado: null },
      0,
    );
    const segundo = agendarSaida(
      { vendidos: 0, total: 100, ultimoAgendado: primeiro },
      0,
    );
    const terceiro = agendarSaida(
      { vendidos: 0, total: 100, ultimoAgendado: segundo },
      0,
    );
    expect(segundo).toBeGreaterThan(primeiro);
    expect(terceiro).toBeGreaterThan(segundo);
  });

  it("campanha esgotada agenda no último título, e não além", () => {
    expect(
      agendarSaida({ vendidos: 100, total: 100, ultimoAgendado: null }, 0.9),
    ).toBe(100);
    expect(
      agendarSaida({ vendidos: 140, total: 100, ultimoAgendado: null }, 0.9),
    ).toBe(100);
  });

  it("campanha de um número só não quebra", () => {
    expect(
      agendarSaida({ vendidos: 0, total: 1, ultimoAgendado: null }, 0.9),
    ).toBe(1);
  });
});

describe("porcentagemDaSaida", () => {
  it("converte o título no que a tela mostra", () => {
    expect(porcentagemDaSaida(40, 100)).toBe(40);
    expect(porcentagemDaSaida(3, 400)).toBeCloseTo(0.75, 4);
  });

  it("sem ponto ou sem total devolve nulo, e não zero", () => {
    // Zero na tela diria "sai agora", que é o contrário de "não agendado".
    expect(porcentagemDaSaida(null, 100)).toBeNull();
    expect(porcentagemDaSaida(10, 0)).toBeNull();
  });
});

describe("compraCasaComSaida", () => {
  it("campo em branco não filtra nada", () => {
    // Um personalizado sem condição vale para qualquer compra, que é
    // diferente de não valer para nenhuma.
    expect(compraCasaComSaida(personalizado({}), COMPRA)).toBe(true);
  });

  it("faixa de tamanho da compra, dos dois lados", () => {
    expect(compraCasaComSaida(personalizado({ titulosDe: 10 }), COMPRA)).toBe(
      true,
    );
    expect(compraCasaComSaida(personalizado({ titulosDe: 11 }), COMPRA)).toBe(
      false,
    );
    expect(compraCasaComSaida(personalizado({ titulosAte: 10 }), COMPRA)).toBe(
      true,
    );
    expect(compraCasaComSaida(personalizado({ titulosAte: 9 }), COMPRA)).toBe(
      false,
    );
  });

  it("janela de data, dos dois lados", () => {
    const antes = new Date("2026-08-30T11:00:00Z");
    const depois = new Date("2026-08-30T13:00:00Z");
    expect(compraCasaComSaida(personalizado({ dataDe: antes }), COMPRA)).toBe(
      true,
    );
    expect(compraCasaComSaida(personalizado({ dataDe: depois }), COMPRA)).toBe(
      false,
    );
    expect(compraCasaComSaida(personalizado({ dataAte: depois }), COMPRA)).toBe(
      true,
    );
    expect(compraCasaComSaida(personalizado({ dataAte: antes }), COMPRA)).toBe(
      false,
    );
  });

  it("DDD: lista vazia aceita todo mundo, lista cheia só quem está nela", () => {
    expect(compraCasaComSaida(personalizado({ ddds: [] }), COMPRA)).toBe(true);
    expect(
      compraCasaComSaida(personalizado({ ddds: ["62", "11"] }), COMPRA),
    ).toBe(true);
    expect(compraCasaComSaida(personalizado({ ddds: ["11"] }), COMPRA)).toBe(
      false,
    );
  });

  it("sem telefone não passa por filtro de DDD", () => {
    // Recusar é o certo: o filtro pede um DDD, e não há um para conferir.
    const semFone = { ...COMPRA, ddd: null };
    expect(compraCasaComSaida(personalizado({ ddds: ["62"] }), semFone)).toBe(
      false,
    );
    expect(compraCasaComSaida(personalizado({ ddds: [] }), semFone)).toBe(true);
  });
});

describe("premioDaVez", () => {
  it("o agendado vencido vem antes de qualquer outra coisa", () => {
    const escolhido = premioDaVez(
      [
        { id: "personalizado", saida: personalizado({}) },
        { id: "agendado", saida: progresso(10) },
      ],
      { vendidos: 12, compra: COMPRA },
    );
    expect(escolhido).toBe("agendado");
  });

  it("entre vários vencidos, o de ponto mais baixo primeiro", () => {
    // Uma compra grande pode pular vários pontos de uma vez. Sem esta ordem, a
    // fila sairia embaralhada e "um atrás do outro" deixaria de valer.
    const escolhido = premioDaVez(
      [
        { id: "c", saida: progresso(30) },
        { id: "a", saida: progresso(10) },
        { id: "b", saida: progresso(20) },
      ],
      { vendidos: 50, compra: COMPRA },
    );
    expect(escolhido).toBe("a");
  });

  it("agendado no futuro não sai", () => {
    expect(
      premioDaVez([{ id: "x", saida: progresso(80) }], {
        vendidos: 79,
        compra: COMPRA,
      }),
    ).toBeNull();
    expect(
      premioDaVez([{ id: "x", saida: progresso(80) }], {
        vendidos: 80,
        compra: COMPRA,
      }),
    ).toBe("x");
  });

  it("personalizado sai quando a compra casa, e espera quando não casa", () => {
    const premios = [{ id: "x", saida: personalizado({ titulosDe: 50 }) }];
    expect(premioDaVez(premios, { vendidos: 10, compra: COMPRA })).toBeNull();
    expect(
      premioDaVez(premios, {
        vendidos: 10,
        compra: { ...COMPRA, titulos: 50 },
      }),
    ).toBe("x");
  });

  it("nada agendado devolve nulo, e quem chamou cai no sorteio de sempre", () => {
    // A saída agendada manda; a chance é a reserva. Devolver um prêmio aqui
    // atropelaria o sorteio por chance que ainda existe.
    expect(premioDaVez([], { vendidos: 10, compra: COMPRA })).toBeNull();
    expect(
      premioDaVez([{ id: "x", saida: progresso(90) }], {
        vendidos: 10,
        compra: COMPRA,
      }),
    ).toBeNull();
  });
});
