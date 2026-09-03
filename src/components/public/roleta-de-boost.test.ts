// A fita da roleta.
//
// O QUE PRECISA SER PROVADO É QUE A FITA NÃO DECIDE NADA.
//
// O prêmio vem do servidor. A fita é montada em volta dele, e por mais 3.5x
// que apareçam passando, a chance não muda: o vencedor já está escolhido e
// ocupa uma posição fixa. Estes testes travam essa separação.
//
// O alinhamento final depende de medidas do DOM (largura do badge, gap,
// metade do container) e por isso é verificado no navegador, não aqui.

import { describe, expect, it } from "vitest";

import { montarFita, type ItemDaFita } from "./roleta-de-boost";

const POSSIVEIS: ItemDaFita[] = [
  { multiplier: 1.5, color: "#A1A1AA" },
  { multiplier: 2.0, color: "#38BDF8" },
  { multiplier: 2.5, color: "#A78BFA" },
  { multiplier: 3.5, color: "#FF4655" },
];

/** Um "acaso" determinístico, para o teste não depender de sorte. */
function sequencia(valores: number[]) {
  let i = 0;
  return () => valores[i++ % valores.length]!;
}

/**
 * Um acaso fixo para a fita e um controlado para a ÚLTIMA decisão.
 *
 * `montarFita` gasta um sorteio por item antes de decidir o vizinho de
 * tensão, então uma sequência cíclica curta nunca chega no valor pretendido.
 */
function fitaFixaEDepois(valorDaFita: number, ultimo: number) {
  let restam = 44;
  return () => (restam-- > 0 ? valorDaFita : ultimo);
}

describe("montarFita", () => {
  it.each([1.5, 2.0, 2.5, 3.5])(
    "o vencedor %sx fica na posição de parada, com a cor dele",
    (m) => {
      const vencedor = POSSIVEIS.find((p) => p.multiplier === m)!;
      const fita = montarFita(vencedor, POSSIVEIS, sequencia([0.1]));
      const posicao = fita.length - 6;
      expect(fita[posicao]!.multiplier).toBe(m);
      expect(fita[posicao]!.color).toBe(vencedor.color);
    },
  );

  it("a fita tem itens depois do vencedor, para não acabar no ar", () => {
    const fita = montarFita(POSSIVEIS[0]!, POSSIVEIS, sequencia([0.1]));
    expect(fita.length - (fita.length - 6)).toBeGreaterThan(1);
  });

  it("a fita é decorativa: repetir 3.5x nela não muda o vencedor", () => {
    // Um acaso que só devolve o último item do pool enche a fita de 3.5x.
    const vencedor = POSSIVEIS[0]!; // 1.5x
    const fita = montarFita(vencedor, POSSIVEIS, sequencia([0.99]));
    const trecoDe35 = fita.filter((i) => i.multiplier === 3.5).length;
    expect(trecoDe35).toBeGreaterThan(10);
    // E mesmo assim quem para no centro é o 1.5x.
    expect(fita[fita.length - 6]!.multiplier).toBe(1.5);
  });

  it("o vizinho de tensão aparece às vezes, e não sempre", () => {
    // Sorteio baixo entra na condição; sorteio alto não. Tensão que acontece
    // toda vez vira aviso de que o prêmio bom está chegando.
    const vencedor = POSSIVEIS[0]!;
    const comTensao = montarFita(vencedor, POSSIVEIS, fitaFixaEDepois(0.1, 0.01));
    const semTensao = montarFita(vencedor, POSSIVEIS, fitaFixaEDepois(0.1, 0.99));
    const pos = comTensao.length - 6;
    // Com o sorteio baixo, o vizinho é o mais raro. Com o alto, não é
    // colocado: fica o que a fita tinha sorteado ali.
    expect(comTensao[pos + 1]!.multiplier).toBe(3.5);
    expect(semTensao[pos + 1]!.multiplier).not.toBe(3.5);
    // Em nenhum dos casos o vencedor muda.
    expect(comTensao[pos]!.multiplier).toBe(1.5);
    expect(semTensao[pos]!.multiplier).toBe(1.5);
  });

  it("o vizinho nunca substitui o próprio vencedor", () => {
    // Quando o vencedor JÁ é o mais raro, não há o que colocar ao lado.
    const vencedor = POSSIVEIS[3]!; // 3.5x
    const fita = montarFita(vencedor, POSSIVEIS, fitaFixaEDepois(0.1, 0.01));
    expect(fita[fita.length - 6]!.multiplier).toBe(3.5);
  });

  it("com um resultado possível só, a fita continua montando", () => {
    const unico: ItemDaFita = { multiplier: 2, color: "#FFF" };
    const fita = montarFita(unico, [unico], sequencia([0.3]));
    expect(fita).toHaveLength(44);
    expect(fita.every((i) => i.multiplier === 2)).toBe(true);
  });

  it("sem lista de possíveis, usa o próprio vencedor", () => {
    const fita = montarFita({ multiplier: 3, color: "#F0F" }, [], sequencia([0.5]));
    expect(fita.every((i) => i.multiplier === 3)).toBe(true);
  });
});
