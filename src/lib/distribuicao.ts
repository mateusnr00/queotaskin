// EM QUAIS unidades da compra os prêmios caem.
//
// Três responsabilidades diferentes moram em três lugares diferentes, e
// misturá-las é o que produzia os defeitos anteriores:
//
//   combos      → QUANTAS unidades a compra recebe   (services de geração)
//   saída       → QUAIS prêmios a compra desbloqueou (lib/saida.ts)
//   distribuição→ EM QUAIS unidades eles caem        (este arquivo)
//
// Aqui só existe a terceira. Nada de banco, nada de regra de negócio sobre
// quem pode sair: chega uma quantidade de unidades e uma lista de prêmios já
// elegíveis, e sai a posição de cada um.
//
// A ESCOLHA É SEM REPOSIÇÃO, E NÃO CHANCE POR UNIDADE.
//
// Chance independente por unidade faria um prêmio elegível poder não sair
// nunca: com 2 prêmios em 20 caixas a 10% cada, existe uma ponta em que as 20
// dão vazio. Sorteando POSIÇÕES entre as unidades, os elegíveis saem sempre, e
// continuam espalhados.

/**
 * Quais posições, de 0 a `unidades - 1`, recebem prêmio.
 *
 * Devolve tantas posições quantos prêmios couberem: com mais prêmios do que
 * unidades, o excesso fica para a próxima compra, e é quem chama que decide o
 * que fazer com o resto.
 *
 * @param aleatorio Sorteia um inteiro em [0, teto). Injetado para o teste
 *                  fixar o acaso; em produção vem do `randomInt` do node:crypto,
 *                  e nunca de Math.random: isto distribui dinheiro.
 */
export function posicoesPremiadas(
  unidades: number,
  premios: number,
  aleatorio: (teto: number) => number,
): number[] {
  const total = Math.max(0, Math.floor(unidades));
  const quantos = Math.min(Math.max(0, Math.floor(premios)), total);
  if (quantos === 0) return [];

  // Seleção de amostra sem reposição, percorrendo as posições uma vez:
  // na posição i, a chance de levar é "quantos faltam" sobre "quantas sobram".
  // Quando os dois se igualam, sai garantido, e é isso que faz o último prêmio
  // sempre encontrar lugar. Uniforme, e sem sortear a mesma posição duas vezes.
  const escolhidas: number[] = [];
  let faltam = quantos;
  for (let i = 0; i < total && faltam > 0; i++) {
    const restantes = total - i;
    if (aleatorio(restantes) < faltam) {
      escolhidas.push(i);
      faltam--;
    }
  }
  return escolhidas;
}

/**
 * O destino de cada unidade: o id do prêmio, ou nulo.
 *
 * A ordem de `premios` é respeitada: quem chama põe primeiro o que deve sair
 * primeiro (o ponto de saída mais baixo), e o primeiro da lista cai na primeira
 * posição sorteada.
 */
export function distribuirPremios(
  unidades: number,
  premios: readonly string[],
  aleatorio: (teto: number) => number,
): (string | null)[] {
  const destino: (string | null)[] = Array.from(
    { length: Math.max(0, Math.floor(unidades)) },
    () => null,
  );
  const posicoes = posicoesPremiadas(destino.length, premios.length, aleatorio);
  posicoes.forEach((pos, i) => {
    destino[pos] = premios[i]!;
  });
  return destino;
}

/** Um prêmio de chance, do jeito que os dois modelos guardam. */
export interface PremioComChance {
  id: string;
  /** Porcentagem. 12.34 quer dizer 12,34%. */
  chance: number;
}

/**
 * O sorteio por chance, unidade a unidade, para as que sobraram sem prêmio.
 *
 * Continua existindo ao lado da distribuição garantida porque as duas coisas
 * são diferentes: prêmio com chance cadastrada é raridade, e forçá-lo a sair no
 * fim da compra transformaria um prêmio de 1% em prêmio garantido. Cada um sai
 * no máximo uma vez, então a lista encolhe conforme eles são levados.
 *
 * @param rolagem Sorteia um número em [0, 100) para cada unidade.
 */
export function sortearPorChance(
  destino: (string | null)[],
  premios: readonly PremioComChance[],
  rolagem: () => number,
  embaralhar: <T>(lista: readonly T[]) => T[],
): (string | null)[] {
  const disponiveis = [...premios];
  return destino.map((atual) => {
    if (atual != null || disponiveis.length === 0) return atual;
    const rolou = rolagem();
    let acumulado = 0;
    for (const p of embaralhar(disponiveis)) {
      acumulado += p.chance;
      if (rolou < acumulado) {
        disponiveis.splice(
          disponiveis.findIndex((d) => d.id === p.id),
          1,
        );
        return p.id;
      }
    }
    return null;
  });
}
