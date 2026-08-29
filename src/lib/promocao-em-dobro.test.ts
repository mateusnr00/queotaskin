import { describe, expect, it } from "vitest";

import {
  bilhetesDe,
  percentualRestante,
  contagemEmPalavras,
  contagemRegressiva,
  dobroAgendado,
  dobroAtivo,
  formatarContagem,
} from "./promocao-em-dobro";

const agora = new Date("2026-08-29T12:00:00.000Z");
const d = (iso: string) => new Date(iso);

describe("dobroAtivo", () => {
  it("desligado nunca vale, mesmo dentro da janela", () => {
    expect(
      dobroAtivo(
        { ativa: false, inicio: d("2026-08-29T00:00:00Z"), fim: d("2026-08-30T00:00:00Z") },
        agora,
      ),
    ).toBe(false);
  });

  it("sem datas, vale enquanto estiver ligado", () => {
    expect(dobroAtivo({ ativa: true, inicio: null, fim: null }, agora)).toBe(true);
  });

  it("respeita o começo e o fim", () => {
    const janela = {
      ativa: true,
      inicio: d("2026-08-29T10:00:00Z"),
      fim: d("2026-08-29T14:00:00Z"),
    };
    expect(dobroAtivo(janela, agora)).toBe(true);
    expect(dobroAtivo(janela, d("2026-08-29T09:59:59Z"))).toBe(false);
    expect(dobroAtivo(janela, d("2026-08-29T15:00:00Z"))).toBe(false);
  });

  it("no instante exato do fim já não vale", () => {
    // A borda importa: um segundo de tolerância aqui é uma compra em dobro
    // depois do anúncio ter dito que acabou.
    const janela = { ativa: true, inicio: null, fim: d("2026-08-29T12:00:00Z") };
    expect(dobroAtivo(janela, agora)).toBe(false);
    expect(dobroAtivo(janela, d("2026-08-29T11:59:59Z"))).toBe(true);
  });

  it("no instante exato do começo já vale", () => {
    const janela = { ativa: true, inicio: d("2026-08-29T12:00:00Z"), fim: null };
    expect(dobroAtivo(janela, agora)).toBe(true);
  });
});

describe("dobroAgendado", () => {
  it("reconhece a promoção que ainda vai começar", () => {
    expect(
      dobroAgendado({ ativa: true, inicio: d("2026-08-29T18:00:00Z"), fim: null }, agora),
    ).toBe(true);
    expect(
      dobroAgendado({ ativa: true, inicio: d("2026-08-29T06:00:00Z"), fim: null }, agora),
    ).toBe(false);
    expect(dobroAgendado({ ativa: false, inicio: d("2026-08-29T18:00:00Z"), fim: null }, agora)).toBe(
      false,
    );
  });
});

describe("bilhetesDe", () => {
  it("dobra a quantidade, e só ela", () => {
    expect(bilhetesDe(10, true)).toBe(20);
    expect(bilhetesDe(10, false)).toBe(10);
    expect(bilhetesDe(1, true)).toBe(2);
  });
});

describe("contagemRegressiva", () => {
  it("quebra em horas, minutos e segundos", () => {
    const c = contagemRegressiva(d("2026-08-30T12:48:29Z"), agora);
    expect(c).toEqual({ horas: 24, minutos: 48, segundos: 29, total: 89309 });
    expect(formatarContagem(c)).toBe("24:48:29");
  });

  it("não vira dias: 32 horas continuam 32 horas", () => {
    // "1 dia e 8 horas" soa como algo que dá para deixar para amanhã.
    expect(formatarContagem(contagemRegressiva(d("2026-08-30T20:00:00Z"), agora))).toBe(
      "32:00:00",
    );
  });

  it("para no zero em vez de contar para trás", () => {
    const c = contagemRegressiva(d("2026-08-29T11:00:00Z"), agora);
    expect(c.total).toBe(0);
    expect(formatarContagem(c)).toBe("00:00:00");
  });

  it("põe dois dígitos em tudo", () => {
    expect(formatarContagem(contagemRegressiva(d("2026-08-29T12:05:07Z"), agora))).toBe(
      "00:05:07",
    );
  });
});

describe("contagemEmPalavras", () => {
  it("diz a mesma coisa que o relógio, em português", () => {
    const emHoras = contagemRegressiva(d("2026-08-30T12:48:29Z"), agora);
    expect(contagemEmPalavras(emHoras)).toBe(
      "A promoção termina em cerca de 24 horas e 48 minutos.",
    );
    expect(
      contagemEmPalavras(contagemRegressiva(d("2026-08-29T13:00:00Z"), agora)),
    ).toBe("A promoção termina em cerca de 1 hora.");
    expect(
      contagemEmPalavras(contagemRegressiva(d("2026-08-29T12:30:00Z"), agora)),
    ).toBe("A promoção termina em cerca de 30 minutos.");
    expect(
      contagemEmPalavras(contagemRegressiva(d("2026-08-29T12:00:30Z"), agora)),
    ).toBe("A promoção termina em menos de um minuto.");
    expect(
      contagemEmPalavras(contagemRegressiva(d("2026-08-29T11:00:00Z"), agora)),
    ).toBe("A promoção terminou.");
  });
});

describe("percentualRestante", () => {
  it("mede o que falta contra a janela inteira", () => {
    const inicio = d("2026-08-29T10:00:00Z");
    const fim = d("2026-08-29T14:00:00Z");
    // 12:00 é a metade de uma janela de 4 horas.
    expect(percentualRestante(inicio, fim, agora)).toBe(50);
    expect(percentualRestante(inicio, fim, d("2026-08-29T11:00:00Z"))).toBe(75);
    expect(percentualRestante(inicio, fim, d("2026-08-29T13:00:00Z"))).toBe(25);
  });

  it("não passa de 100 nem cai abaixo de zero", () => {
    // Antes de começar a barra fica cheia; depois de acabar, vazia. Barra que
    // passa dos extremos vaza para fora do trilho na tela.
    const inicio = d("2026-08-29T10:00:00Z");
    const fim = d("2026-08-29T14:00:00Z");
    expect(percentualRestante(inicio, fim, d("2026-08-29T08:00:00Z"))).toBe(100);
    expect(percentualRestante(inicio, fim, d("2026-08-29T20:00:00Z"))).toBe(0);
  });

  it("devolve null quando não dá para saber", () => {
    // Sem começo não existe "quanto já passou", e desenhar uma barra ali
    // seria chute com cara de informação.
    expect(percentualRestante(null, d("2026-08-29T14:00:00Z"), agora)).toBeNull();
    expect(percentualRestante(d("2026-08-29T10:00:00Z"), null, agora)).toBeNull();
    // Janela invertida ou de duração zero também não desenha.
    expect(
      percentualRestante(d("2026-08-29T14:00:00Z"), d("2026-08-29T10:00:00Z"), agora),
    ).toBeNull();
  });
});
