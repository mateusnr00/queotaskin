import { describe, expect, it } from "vitest";

import {
  conferirProva,
  gerarSemente,
  hashDaSemente,
  indiceVencedor,
  manifestoCanonico,
  sementeDoManifesto,
  sortearComProva,
  titulosCanonicos,
  type ProvaDoSorteio,
} from "@/lib/sorteio-justo";

const SEMENTE =
  "5b1f2d8c9a0e4713bb6c2f8a1d3e5c7091a2b3c4d5e6f708192a3b4c5d6e7f80";

describe("manifesto canônico", () => {
  it("ordena, remove repetido e separa por linha", () => {
    expect(manifestoCanonico([3, 1, 2])).toBe("1\n2\n3");
    expect(manifestoCanonico([7, 7, 7])).toBe("7");
    expect(titulosCanonicos([10, 2, 2, 1])).toEqual([1, 2, 10]);
  });

  it("a ordem de entrada não muda o resultado", async () => {
    // É o contrato da verificação: quem confere recebe a lista em qualquer
    // ordem e precisa chegar ao mesmo hash que o servidor.
    const a = await sementeDoManifesto([5, 1, 9, 3]);
    const b = await sementeDoManifesto([9, 3, 5, 1]);
    expect(a).toBe(b);
  });

  it("um título a mais muda a semente pública inteira", async () => {
    const antes = await sementeDoManifesto([1, 2, 3]);
    const depois = await sementeDoManifesto([1, 2, 3, 4]);
    expect(antes).not.toBe(depois);
  });
});

describe("semente", () => {
  it("gera 32 bytes em hexadecimal, e nunca a mesma duas vezes", () => {
    const a = gerarSemente();
    const b = gerarSemente();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("o compromisso é o sha256 da semente", async () => {
    expect(await hashDaSemente("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("índice vencedor", () => {
  it("é determinístico: mesma entrada, mesmo resultado", async () => {
    const a = await indiceVencedor(SEMENTE, "publica", 1, 100);
    const b = await indiceVencedor(SEMENTE, "publica", 1, 100);
    expect(a).toEqual(b);
    expect(a.hmacHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cai sempre dentro do bolo", async () => {
    for (const total of [1, 2, 7, 100, 9999]) {
      const { winnerIndex } = await indiceVencedor(SEMENTE, "x", 1, total);
      expect(winnerIndex).toBeGreaterThanOrEqual(0);
      expect(winnerIndex).toBeLessThan(total);
    }
  });

  it("trocar o nonce troca o resultado", async () => {
    const um = await indiceVencedor(SEMENTE, "x", 1, 1000);
    const dois = await indiceVencedor(SEMENTE, "x", 2, 1000);
    expect(um.winnerIndex).not.toBe(dois.winnerIndex);
  });

  it("recusa bolo vazio em vez de devolver lixo", async () => {
    await expect(indiceVencedor(SEMENTE, "x", 1, 0)).rejects.toThrow();
  });

  it("espalha razoavelmente por todo o bolo", async () => {
    // Não é teste de aleatoriedade, é rede contra o erro grosseiro: um bug de
    // BigInt ou de módulo prenderia o resultado num punhado de posições.
    const dez = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const { winnerIndex } = await indiceVencedor(gerarSemente(), "x", 1, 10);
      dez.add(winnerIndex);
    }
    expect(dez.size).toBe(10);
  });
});

describe("sortearComProva", () => {
  it("devolve prova completa e o título que está na posição sorteada", async () => {
    const numeros = Array.from({ length: 500 }, (_, i) => i + 1);
    const prova = await sortearComProva(numeros, SEMENTE);

    expect(prova.ticketCount).toBe(500);
    expect(prova.serverSeedHash).toBe(await hashDaSemente(SEMENTE));
    expect(prova.clientSeed).toBe(await sementeDoManifesto(numeros));
    expect(prova.winningNumber).toBe(
      titulosCanonicos(numeros)[prova.winnerIndex],
    );
  });

  it("o mesmo sorteio, refeito, dá exatamente o mesmo número", async () => {
    // É o que permite reconstruir o resultado anos depois a partir do
    // comprovante, sem depender do banco.
    const numeros = [4, 8, 15, 16, 23, 42];
    const a = await sortearComProva(numeros, SEMENTE);
    const b = await sortearComProva([...numeros].reverse(), SEMENTE);
    expect(b.winningNumber).toBe(a.winningNumber);
  });

  it("só sorteia título que existe na lista", async () => {
    const numeros = [7, 19, 500, 3001];
    for (let i = 0; i < 25; i++) {
      const prova = await sortearComProva(numeros, gerarSemente());
      expect(numeros).toContain(prova.winningNumber);
    }
  });

  it("recusa campanha sem título elegível", async () => {
    await expect(sortearComProva([], SEMENTE)).rejects.toThrow();
  });
});

describe("uniformidade do sorteio", () => {
  // Existe por causa de uma reclamação real: "o sorteio sempre fica nos
  // últimos números". Era impressão de amostra pequena, três resultados
  // seguidos na metade de cima, o que acontece uma vez em oito. Mas a
  // pergunta é boa demais para ficar dependendo de eu medir à mão de novo:
  // este teste falha se algum dia o sorteador pender para um pedaço da lista.
  //
  // O limite é frouxo de propósito. Qui-quadrado com nove graus de liberdade
  // passa de 21,67 uma vez em cem por puro acaso, e um teste que falha uma
  // execução em cem é um teste que as pessoas aprendem a ignorar. Em 40 a
  // chance de falso alarme é de uma em cem mil, e um viés de verdade estoura
  // isso com folga.
  it("espalha os sorteios por toda a lista de títulos", async () => {
    const TOTAL = 100;
    const RODADAS = 4000;
    const titulos = Array.from({ length: TOTAL }, (_, i) => i + 1);
    const clientSeed = await sementeDoManifesto(titulos);

    const decis = new Array(10).fill(0);
    let soma = 0;
    for (let i = 0; i < RODADAS; i++) {
      const { winnerIndex } = await indiceVencedor(
        gerarSemente(),
        clientSeed,
        1,
        TOTAL,
      );
      decis[Math.floor((winnerIndex / TOTAL) * 10)]++;
      soma += winnerIndex;
    }

    const esperado = RODADAS / 10;
    const qui = decis.reduce((a, c) => a + (c - esperado) ** 2 / esperado, 0);
    expect(qui).toBeLessThan(40);

    // E a média no meio da lista: um viés que mantivesse os decis parelhos
    // mas puxasse dentro deles não apareceria no qui-quadrado.
    const media = soma / RODADAS;
    expect(media).toBeGreaterThan(TOTAL * 0.44);
    expect(media).toBeLessThan(TOTAL * 0.56);

    // Nenhum decil vazio, que é como um erro grosseiro de índice apareceria.
    expect(decis.every((c) => c > 0)).toBe(true);
  }, 120000);

  it("não repete o mesmo vencedor com sementes diferentes", async () => {
    const titulos = Array.from({ length: 1000 }, (_, i) => i + 1);
    const vencedores = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const prova = await sortearComProva(titulos, gerarSemente());
      vencedores.add(prova.winningNumber);
    }
    // Cinquenta sorteios em mil títulos: repetir algum é possível, mas cair
    // em menos de quarenta valores distintos seria sinal de travamento.
    expect(vencedores.size).toBeGreaterThan(40);
  }, 60000);
});

describe("conferirProva", () => {
  const numeros = Array.from({ length: 250 }, (_, i) => i + 1);

  it("aprova uma prova honesta", async () => {
    const prova = await sortearComProva(numeros, SEMENTE);
    const { ok, checagens } = await conferirProva(prova, numeros);
    expect(ok).toBe(true);
    expect(Object.values(checagens).every(Boolean)).toBe(true);
  });

  it("aprova mesmo com a lista embaralhada", async () => {
    const prova = await sortearComProva(numeros, SEMENTE);
    const bagunca = [...numeros].sort(() => Math.random() - 0.5);
    expect((await conferirProva(prova, bagunca)).ok).toBe(true);
  });

  it("reprova quando a semente ainda não foi revelada", async () => {
    const prova = await sortearComProva(numeros, SEMENTE);
    const semSemente: ProvaDoSorteio = { ...prova, serverSeed: null };
    const { ok, checagens } = await conferirProva(semSemente, numeros);
    expect(ok).toBe(false);
    expect(checagens.sementeRevelada).toBe(false);
  });

  it("reprova quando a semente publicada não é a que foi travada", async () => {
    // O caso que a checagem existe para pegar: alguém sorteia, não gosta do
    // resultado, e publica outra semente.
    const prova = await sortearComProva(numeros, SEMENTE);
    const trocada: ProvaDoSorteio = { ...prova, serverSeed: gerarSemente() };
    const { ok, checagens } = await conferirProva(trocada, numeros);
    expect(ok).toBe(false);
    expect(checagens.compromissoConfere).toBe(false);
  });

  it("reprova quando o número anunciado não é o sorteado", async () => {
    const prova = await sortearComProva(numeros, SEMENTE);
    const mentira: ProvaDoSorteio = {
      ...prova,
      winningNumber: prova.winningNumber === 1 ? 2 : 1,
    };
    const { ok, checagens } = await conferirProva(mentira, numeros);
    expect(ok).toBe(false);
    expect(checagens.vencedorConfere).toBe(false);
  });

  it("reprova quando a lista de títulos foi mexida depois", async () => {
    // Tirar um perdedor do bolo depois do sorteio muda o manifesto, e é
    // exatamente isso que o hash denuncia.
    const prova = await sortearComProva(numeros, SEMENTE);
    const mexida = numeros.filter((n) => n !== prova.winningNumber + 1);
    const { ok, checagens } = await conferirProva(prova, mexida);
    expect(ok).toBe(false);
    expect(checagens.manifestoConfere).toBe(false);
  });

  it("reprova quando o índice publicado não é o do cálculo", async () => {
    const prova = await sortearComProva(numeros, SEMENTE);
    const torto: ProvaDoSorteio = {
      ...prova,
      winnerIndex: (prova.winnerIndex + 1) % prova.ticketCount,
    };
    const { checagens } = await conferirProva(torto, numeros);
    expect(checagens.indiceConfere).toBe(false);
  });

  it("todo rótulo de checagem existe", async () => {
    const prova = await sortearComProva(numeros, SEMENTE);
    const { checagens } = await conferirProva(prova, numeros);
    const { ROTULO_DA_CHECAGEM } = await import("@/lib/sorteio-justo");
    for (const chave of Object.keys(checagens)) {
      expect(ROTULO_DA_CHECAGEM[chave as keyof typeof checagens]).toBeTruthy();
    }
  });
});
