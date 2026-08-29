import { describe, expect, it } from "vitest";

import {
  TEMPOS_PADRAO,
  faseDoSorteio,
  formatarContagemCurta,
  idPublicoDoSorteio,
  idPublicoValido,
  marcosDoSorteio,
  percentualDaContagem,
  podeMostrarGanhador,
  podeMostrarNumero,
  proximaVirada,
  segundosAte,
  temposConfigurados,
  type SituacaoDoSorteio,
} from "@/lib/sorteio-ao-vivo";

const d = (iso: string) => new Date(iso);
const FIM = d("2026-08-29T19:00:00.000Z");

const marcos = marcosDoSorteio(FIM, TEMPOS_PADRAO);

function situacao(over: Partial<SituacaoDoSorteio> = {}): SituacaoDoSorteio {
  return {
    drawScheduledAt: marcos.drawScheduledAt,
    drawStartsAt: marcos.drawStartsAt,
    revealAt: marcos.revealAt,
    winnerRevealAt: marcos.winnerRevealAt,
    temResultado: true,
    ...over,
  };
}

describe("marcosDoSorteio", () => {
  it("calcula a linha do tempo inteira a partir do encerramento", () => {
    expect(marcos.drawScheduledAt.toISOString()).toBe("2026-08-29T19:10:00.000Z");
    expect(marcos.drawStartsAt.toISOString()).toBe("2026-08-29T19:11:00.000Z");
    expect(marcos.revealAt.toISOString()).toBe("2026-08-29T19:11:09.000Z");
    expect(marcos.winnerRevealAt.toISOString()).toBe("2026-08-29T19:11:13.000Z");
  });

  it("os marcos sobem sempre, sem empate", () => {
    const ordem = [
      marcos.raffleEndedAt,
      marcos.drawScheduledAt,
      marcos.drawStartsAt,
      marcos.revealAt,
      marcos.winnerRevealAt,
    ].map((x) => x.getTime());
    for (let i = 1; i < ordem.length; i++) {
      expect(ordem[i]).toBeGreaterThan(ordem[i - 1]);
    }
  });
});

describe("faseDoSorteio", () => {
  it("percorre as fases na ordem, com a virada no instante exato", () => {
    const s = situacao();
    expect(faseDoSorteio(s, d("2026-08-29T19:00:00Z"))).toBe("WAITING_DRAW");
    expect(faseDoSorteio(s, d("2026-08-29T19:09:59Z"))).toBe("WAITING_DRAW");
    // No instante do agendamento a contagem já vale: um segundo de tolerância
    // aqui é a página anunciando "em breve" com o relógio zerado.
    expect(faseDoSorteio(s, d("2026-08-29T19:10:00Z"))).toBe("COUNTDOWN");
    expect(faseDoSorteio(s, d("2026-08-29T19:10:59Z"))).toBe("COUNTDOWN");
    expect(faseDoSorteio(s, d("2026-08-29T19:11:00Z"))).toBe("DRAWING");
    expect(faseDoSorteio(s, d("2026-08-29T19:11:08Z"))).toBe("DRAWING");
    expect(faseDoSorteio(s, d("2026-08-29T19:11:09Z"))).toBe("REVEALING");
    expect(faseDoSorteio(s, d("2026-08-29T19:11:12Z"))).toBe("REVEALING");
    expect(faseDoSorteio(s, d("2026-08-29T19:11:13Z"))).toBe("FINISHED");
  });

  it("não passa de DRAWING enquanto o motor não escolheu o número", () => {
    // O caso do servidor que dormiu: o relógio já passou da revelação, mas
    // não existe resultado. Anunciar REVEALING aqui seria abrir uma tela de
    // revelação vazia.
    const s = situacao({ temResultado: false });
    expect(faseDoSorteio(s, d("2026-08-29T19:11:09Z"))).toBe("DRAWING");
    expect(faseDoSorteio(s, d("2026-08-29T23:00:00Z"))).toBe("DRAWING");
  });

  it("quem chega muito atrasado cai direto no fim", () => {
    expect(faseDoSorteio(situacao(), d("2026-09-15T12:00:00Z"))).toBe("FINISHED");
  });

  it("falha definitiva vence qualquer relógio", () => {
    expect(
      faseDoSorteio(situacao({ falhou: true }), d("2026-08-29T19:00:00Z")),
    ).toBe("ERROR");
  });
});

describe("liberação do resultado", () => {
  it("o número só aparece na hora marcada, e o nome depois dele", () => {
    const s = situacao();
    expect(podeMostrarNumero(s, d("2026-08-29T19:11:08Z"))).toBe(false);
    expect(podeMostrarNumero(s, d("2026-08-29T19:11:09Z"))).toBe(true);
    expect(podeMostrarGanhador(s, d("2026-08-29T19:11:09Z"))).toBe(false);
    expect(podeMostrarGanhador(s, d("2026-08-29T19:11:13Z"))).toBe(true);
  });

  it("sem resultado escolhido, nada aparece por mais tarde que seja", () => {
    const s = situacao({ temResultado: false });
    expect(podeMostrarNumero(s, d("2026-09-01T00:00:00Z"))).toBe(false);
    expect(podeMostrarGanhador(s, d("2026-09-01T00:00:00Z"))).toBe(false);
  });
});

describe("proximaVirada", () => {
  it("aponta o próximo marco, e não o primeiro da lista", () => {
    const s = situacao();
    expect(proximaVirada(s, d("2026-08-29T19:00:00Z"))).toEqual(
      marcos.drawScheduledAt,
    );
    expect(proximaVirada(s, d("2026-08-29T19:10:30Z"))).toEqual(
      marcos.drawStartsAt,
    );
    expect(proximaVirada(s, d("2026-08-29T19:11:05Z"))).toEqual(marcos.revealAt);
    expect(proximaVirada(s, d("2026-08-29T19:11:10Z"))).toEqual(
      marcos.winnerRevealAt,
    );
  });

  it("no fim não há próxima virada, e a página para de perguntar", () => {
    expect(proximaVirada(situacao(), d("2026-08-29T19:20:00Z"))).toBeNull();
  });
});

describe("segundosAte", () => {
  it("arredonda para cima, para o relógio mostrar 01 até virar 00", () => {
    expect(segundosAte(d("2026-08-29T19:11:00Z"), d("2026-08-29T19:10:00Z"))).toBe(60);
    expect(segundosAte(d("2026-08-29T19:11:00Z"), d("2026-08-29T19:10:59.5Z"))).toBe(1);
  });

  it("nunca conta para trás", () => {
    expect(segundosAte(d("2026-08-29T19:00:00Z"), d("2026-08-29T19:30:00Z"))).toBe(0);
  });
});

describe("formatarContagemCurta", () => {
  it("põe dois dígitos e não inventa horas", () => {
    expect(formatarContagemCurta(60)).toBe("01:00");
    expect(formatarContagemCurta(9)).toBe("00:09");
    expect(formatarContagemCurta(0)).toBe("00:00");
    expect(formatarContagemCurta(-5)).toBe("00:00");
  });
});

describe("percentualDaContagem", () => {
  it("enche com o tempo que já passou", () => {
    const s = situacao();
    expect(percentualDaContagem(s, d("2026-08-29T19:10:00Z"))).toBe(0);
    expect(percentualDaContagem(s, d("2026-08-29T19:10:30Z"))).toBe(50);
    expect(percentualDaContagem(s, d("2026-08-29T19:11:00Z"))).toBe(100);
  });

  it("não vaza dos extremos", () => {
    const s = situacao();
    expect(percentualDaContagem(s, d("2026-08-29T18:00:00Z"))).toBe(0);
    expect(percentualDaContagem(s, d("2026-08-29T20:00:00Z"))).toBe(100);
  });
});

describe("temposConfigurados", () => {
  it("usa os valores de produção quando não há nada no ambiente", () => {
    expect(temposConfigurados({} as unknown as NodeJS.ProcessEnv)).toEqual(TEMPOS_PADRAO);
  });

  it("aceita o encurtamento de desenvolvimento", () => {
    expect(
      temposConfigurados({
        DRAW_WAIT_SECONDS: "10",
        DRAW_COUNTDOWN_SECONDS: "10",
      } as unknown as NodeJS.ProcessEnv),
    ).toMatchObject({ esperaSegundos: 10, contagemSegundos: 10 });
  });

  it("ignora lixo e prende valores absurdos nos limites", () => {
    // Um zero aqui faria a contagem terminar antes de começar, e a divisão da
    // barra de progresso cair em zero.
    const t = temposConfigurados({
      DRAW_WAIT_SECONDS: "abacaxi",
      DRAW_COUNTDOWN_SECONDS: "0",
      DRAW_ROLLING_SECONDS: "99999",
    } as unknown as NodeJS.ProcessEnv);
    expect(t.esperaSegundos).toBe(TEMPOS_PADRAO.esperaSegundos);
    expect(t.contagemSegundos).toBe(5);
    expect(t.rolagemSegundos).toBe(120);
  });
});

describe("idPublicoDoSorteio", () => {
  const sorteador = (tamanho: number) =>
    Array.from({ length: tamanho }, (_, i) => i);

  it("carimba a data de Brasília, e não a do servidor", () => {
    // 21h de Brasília é 00h do dia seguinte em UTC. O comprovante precisa
    // dizer o dia em que as pessoas assistiram.
    expect(idPublicoDoSorteio(d("2026-08-30T00:11:00Z"), sorteador)).toBe(
      "DRW-20260829-0123",
    );
  });

  it("gera um código que passa na própria validação", () => {
    const id = idPublicoDoSorteio(d("2026-08-29T19:00:00Z"), (n) =>
      Array.from({ length: n }, () => 33),
    );
    expect(id).toBe("DRW-20260829-ZZZZ");
    expect(idPublicoValido(id)).toBe(true);
  });

  it("recusa código torto antes de ir ao banco", () => {
    expect(idPublicoValido("DRW-20260829-8F2C")).toBe(true);
    expect(idPublicoValido("drw-20260829-8f2c")).toBe(false);
    expect(idPublicoValido("DRW-20260829-8F2I")).toBe(false);
    expect(idPublicoValido("' OR 1=1 --")).toBe(false);
    expect(idPublicoValido("DRW-2026-8F2C")).toBe(false);
  });
});
