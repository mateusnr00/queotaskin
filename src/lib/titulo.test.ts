import { describe, expect, it } from "vitest";

import {
  casasDoTitulo,
  embaralhamentoEstavel,
  numeroDoTitulo,
  ordemEmbaralhada,
  tituloDaFita,
} from "@/lib/titulo";

describe("numeroDoTitulo", () => {
  it("usa a largura da campanha, e não uma largura fixa", () => {
    // O defeito relatado: a home cravava quatro casas, e numa campanha de cem
    // cotas o título 30 virava "0030", inventando um dígito que não existe.
    expect(numeroDoTitulo(30, 100)).toBe("030");
    expect(numeroDoTitulo(30, 1000)).toBe("0030");
    expect(numeroDoTitulo(30, 10)).toBe("30");
    expect(numeroDoTitulo(7, 10)).toBe("07");
  });

  it("nunca escreve um título de um dígito só", () => {
    expect(numeroDoTitulo(7, 5)).toBe("07");
    expect(casasDoTitulo(1)).toBe(2);
    expect(casasDoTitulo(0)).toBe(2);
  });

  it("não corta número maior que a campanha", () => {
    // Não deveria acontecer, mas cortar o número seria pior do que mostrá-lo
    // largo: o título é a identidade de quem ganhou.
    expect(numeroDoTitulo(12345, 100)).toBe("12345");
  });

  it("o mesmo número tem a mesma cara em qualquer tela da mesma campanha", () => {
    const total = 500;
    expect(numeroDoTitulo(42, total)).toBe(numeroDoTitulo(42, total));
    expect(numeroDoTitulo(42, total)).toBe("042");
  });
});

describe("embaralhamentoEstavel", () => {
  it("é estável: a mesma entrada dá sempre a mesma saída", () => {
    expect(embaralhamentoEstavel("cmtd3emp00000jc0ae14pkf8p")).toBe(
      embaralhamentoEstavel("cmtd3emp00000jc0ae14pkf8p"),
    );
  });

  it("entradas parecidas caem longe uma da outra", () => {
    // É o ponto: cuids consecutivos diferem em poucos caracteres do fim, e
    // ordenar por eles é ordenar por data de criação.
    const a = embaralhamentoEstavel("cmtd3njag0001jc0an7adc1sm");
    const b = embaralhamentoEstavel("cmtd3nmr50002jc0aiw5g3zbw");
    expect(a).not.toBe(b);
  });

  it("devolve inteiro sem sinal", () => {
    for (const t of ["", "a", "cmtd3nugh0000hw0a18z0ddw2", "ção"]) {
      const h = embaralhamentoEstavel(t);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ordemEmbaralhada", () => {
  // Os ids reais dos sete prêmios de caixa surpresa que estavam em produção,
  // na ordem em que foram cadastrados. Foi neles que o defeito apareceu.
  const IDS_REAIS = [
    "cmtai9arr000bj80ajqzna4xz",
    "cmtd3emp00000jc0ae14pkf8p",
    "cmtd3n1gg0000l204q26e0vbm",
    "cmtd3ncbb0000jc0an9adsop7",
    "cmtd3njag0001jc0an7adc1sm",
    "cmtd3nmr50002jc0aiw5g3zbw",
    "cmtd3nugh0000hw0a18z0ddw2",
  ];

  it("não devolve a ordem de cadastro", () => {
    const saida = ordemEmbaralhada(IDS_REAIS, (x) => x);
    expect(saida).not.toEqual(IDS_REAIS);
    // E nem a ordem por id, que era o mesmo que a de cadastro.
    expect(saida).not.toEqual([...IDS_REAIS].sort());
  });

  it("não perde nem duplica ninguém", () => {
    const saida = ordemEmbaralhada(IDS_REAIS, (x) => x);
    expect(saida).toHaveLength(IDS_REAIS.length);
    expect([...saida].sort()).toEqual([...IDS_REAIS].sort());
  });

  it("é a mesma ordem em toda visita", () => {
    // A página é renderizada no servidor: uma lista que se reembaralha a cada
    // atualização parece defeito para quem está olhando.
    const a = ordemEmbaralhada(IDS_REAIS, (x) => x);
    const b = ordemEmbaralhada([...IDS_REAIS].reverse(), (x) => x);
    expect(a).toEqual(b);
  });

  it("o primeiro cadastrado não fica sempre no topo", () => {
    // O defeito, dito em uma linha: era sempre o primeiro, e a lista fechada
    // mostra só os cinco primeiros.
    const saida = ordemEmbaralhada(IDS_REAIS, (x) => x);
    expect(saida[0]).not.toBe(IDS_REAIS[0]);
  });

  it("aguenta lista vazia e de um item", () => {
    expect(ordemEmbaralhada([], (x: string) => x)).toEqual([]);
    expect(ordemEmbaralhada(["um"], (x) => x)).toEqual(["um"]);
  });
});

describe("tituloDaFita", () => {
  const bolo = [3, 14, 15, 92, 65, 35, 89, 79, 32, 38];

  it("mesma posição e mesmo sorteio dão sempre o mesmo título", () => {
    // O contrato: reabrir a transmissão mostra a MESMA fita. Era o que
    // faltava, e a falta disso passava a impressão de sorteio improvisado.
    for (const i of [0, 1, 7, 42, 1000]) {
      expect(tituloDaFita("DRW-20260829-0MJ5", i, bolo, 100)).toBe(
        tituloDaFita("DRW-20260829-0MJ5", i, bolo, 100),
      );
    }
  });

  it("sorteios diferentes têm fitas diferentes", () => {
    const a = Array.from({ length: 12 }, (_, i) =>
      tituloDaFita("DRW-20260829-AAAA", i, bolo, 100),
    );
    const b = Array.from({ length: 12 }, (_, i) =>
      tituloDaFita("DRW-20260829-BBBB", i, bolo, 100),
    );
    expect(a).not.toEqual(b);
  });

  it("só mostra título que disputou", () => {
    for (let i = 0; i < 200; i++) {
      expect(bolo).toContain(tituloDaFita("x", i, bolo, 100));
    }
  });

  it("sem lista, fica dentro do intervalo da campanha", () => {
    for (let i = 0; i < 200; i++) {
      const n = tituloDaFita("x", i, [], 100);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(100);
    }
  });

  it("não trava num número só: a fita varia ao longo das posições", () => {
    const vistos = new Set(
      Array.from({ length: 40 }, (_, i) => tituloDaFita("x", i, bolo, 100)),
    );
    expect(vistos.size).toBeGreaterThan(5);
  });

  it("posições seguidas não repetem o mesmo número", () => {
    // Fita que mostra 07, 07, 07 parece travada. Não é garantia absoluta com
    // bolo pequeno, mas com dez títulos a chance de três iguais é remota.
    let repetidos = 0;
    for (let i = 1; i < 60; i++) {
      if (tituloDaFita("x", i, bolo, 100) === tituloDaFita("x", i - 1, bolo, 100)) {
        repetidos++;
      }
    }
    expect(repetidos).toBeLessThan(12);
  });
});
