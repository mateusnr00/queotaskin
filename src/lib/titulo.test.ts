import { describe, expect, it } from "vitest";

import {
  INICIO_DA_CAUDA,
  casasDoTitulo,
  embaralhamentoEstavel,
  numeroDoTitulo,
  ordemEmbaralhada,
  tituloDaCauda,
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

  it("campanha de cem tem três casas, porque vai ATÉ o cem", () => {
    // O caso que a lista de títulos premiados errava: ela contava as casas
    // sobre 99 e escrevia "07" ao lado de "100", com larguras diferentes na
    // mesma coluna. Uma campanha de 1 a 100 tem três dígitos, e o último
    // título é quem manda.
    expect(casasDoTitulo(100)).toBe(3);
    expect(numeroDoTitulo(7, 100)).toBe("007");
    expect(numeroDoTitulo(100, 100)).toBe("100");
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

  it("os premiados não saem grudados no começo da lista", () => {
    // O relato: numa compra de nove caixas, as três premiadas apareceram nas
    // posições 1, 2 e 3, com seis vazias embaixo. A causa era "Abrir todas"
    // abrindo de cima para baixo, porque o prêmio agendado vai para a
    // PRIMEIRA caixa aberta, e a primeira aberta era sempre a primeira da
    // lista. Abrindo em ordem embaralhada, os três prêmios caem espalhados.
    //
    // Ids de caixas de verdade, no formato que o Prisma gera: eles compartilham
    // o prefixo do instante de criação, que é justamente o caso difícil para
    // um embaralhamento por hash.
    const CAIXAS = [
      "cmtd4g9pa00007dqa202oeolo",
      "cmtd4g9pm00027dqavkbfj648",
      "cmtd5qzdp00007dxa63a7llws",
      "cmth8swfn003u7d6bgaoneo8u",
      "cmth8vuvq003u7df69mzxxg5d",
      "cmtha5ob4003u7d8zu0jpehj0",
      "cmt90l7xf00087d5yftqzkudd",
      "cmt90l7xp000b7d5yti1kuarx",
      "cmt90l7xv000e7d5yj0mn50z3",
    ];
    const ordemDeAbrir = ordemEmbaralhada(CAIXAS, (x) => x);
    // As três primeiras abertas são as que recebem os prêmios agendados.
    const posicoes = ordemDeAbrir
      .slice(0, 3)
      .map((id) => CAIXAS.indexOf(id))
      .sort((a, b) => a - b);
    expect(posicoes).not.toEqual([0, 1, 2]);
    // E não ficam todas na primeira metade, que seria o mesmo defeito de novo.
    expect(posicoes[posicoes.length - 1]).toBeGreaterThan(2);
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
      if (
        tituloDaFita("x", i, bolo, 100) === tituloDaFita("x", i - 1, bolo, 100)
      ) {
        repetidos++;
      }
    }
    expect(repetidos).toBeLessThan(12);
  });
});

describe("tituloDaCauda", () => {
  const AMOSTRA = [7, 11, 23, 41, 63, 75, 79, 88, 91, 99];
  const TOTAL = 100;
  const SEMENTE = "DRW-2026-0830";
  const VENCEDOR = 63;

  // O quadro final da fita: linha de cima, vencedor, linha de baixo. Os dois
  // vizinhos saem de passos FIXOS da cauda, e é isso que precisa ser igual em
  // qualquer aparelho.
  const PASSOS_DA_FREADA = 9;
  const quadroFinal = (semente: string) => [
    tituloDaCauda(semente, PASSOS_DA_FREADA - 1, AMOSTRA, TOTAL, VENCEDOR),
    VENCEDOR,
    tituloDaCauda(semente, PASSOS_DA_FREADA + 1, AMOSTRA, TOTAL, VENCEDOR),
  ];

  it("o quadro final não depende de quanto a fita girou", () => {
    // Este é o defeito que o teste existe para impedir. Antes, os vizinhos
    // vinham da posição corrida da fita, que depende de quantos passos deram
    // até o resultado chegar: com rede lenta, mais passos, outros vizinhos. O
    // celular parava entre 079 e 041 e o computador entre 011 e 075, com o
    // mesmo vencedor no meio, e quem comparava as duas telas desconfiava.
    //
    // A cauda não recebe a posição, então não há como o giro influenciá-la.
    expect(quadroFinal(SEMENTE)).toEqual(quadroFinal(SEMENTE));
    expect(quadroFinal(SEMENTE)).toEqual([
      tituloDaCauda(SEMENTE, 8, AMOSTRA, TOTAL, VENCEDOR),
      63,
      tituloDaCauda(SEMENTE, 10, AMOSTRA, TOTAL, VENCEDOR),
    ]);
  });

  it("a fórmula ANTIGA divergia com o tempo de giro, e a nova não", () => {
    // A prova do defeito, e o motivo de ele só aparecer AO VIVO.
    //
    // Num sorteio já encerrado o vencedor chega no primeiro quadro, a fita
    // freia sempre do mesmo ponto e o fim é igual para todos. Ao vivo não: ela
    // gira sem alvo até o resultado chegar, e quantos passos ela dá depende do
    // respiro aleatório de 150 a 750ms antes da busca. Com passo de 55ms, isso
    // são uns onze passos de diferença entre um visitante e outro.
    //
    // ANTES, os vizinhos saíam da posição corrida da fita, então cada
    // quantidade de passos dava um par diferente:
    const antigo = (passosDeGiro: number) => {
      const posicao = 3 + passosDeGiro + PASSOS_DA_FREADA;
      return [
        tituloDaFita(SEMENTE, posicao - 2, AMOSTRA, TOTAL),
        VENCEDOR,
        tituloDaFita(SEMENTE, posicao, AMOSTRA, TOTAL),
      ];
    };
    const antigos = new Set(
      [0, 3, 7, 11, 20, 45].map((n) => JSON.stringify(antigo(n))),
    );
    expect(antigos.size).toBeGreaterThan(1);

    // AGORA a cauda não recebe a posição, então não há o que divergir: o par é
    // o mesmo por construção, para qualquer tempo de giro.
    expect(quadroFinal(SEMENTE)).toEqual(quadroFinal(SEMENTE));
  });

  it("os índices da cauda ficam longe dos que o giro alcança", () => {
    // Se as duas faixas se encontrassem, um giro muito longo cairia dentro da
    // cauda e o fim da fita voltaria a depender do tempo.
    expect(INICIO_DA_CAUDA).toBeGreaterThan(100_000);
  });

  it("sorteios diferentes têm caudas diferentes", () => {
    // Determinístico não pode virar igual para todo mundo: cada transmissão
    // tem a sua fita.
    const a = Array.from({ length: 12 }, (_, k) =>
      tituloDaCauda("DRW-A", k, AMOSTRA, TOTAL),
    );
    const b = Array.from({ length: 12 }, (_, k) =>
      tituloDaCauda("DRW-B", k, AMOSTRA, TOTAL),
    );
    expect(a).not.toEqual(b);
  });

  it("o vizinho visível não repete o vencedor", () => {
    // Duas linhas com o mesmo número no quadro final parecem defeito.
    for (const semente of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      for (const passo of [PASSOS_DA_FREADA - 1, PASSOS_DA_FREADA + 1]) {
        expect(
          tituloDaCauda(semente, passo, AMOSTRA, TOTAL, VENCEDOR),
        ).not.toBe(VENCEDOR);
      }
    }
  });

  it("campanha de um número só não trava procurando outro", () => {
    // Não existe outro título para achar. Devolve o que tem, sem laço infinito.
    expect(tituloDaCauda("x", 3, [63], TOTAL, 63)).toBe(63);
  });

  it("sem amostra, cai no intervalo da campanha", () => {
    for (let k = 0; k < 20; k++) {
      const n = tituloDaCauda("x", k, [], 50);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(50);
    }
  });
});
