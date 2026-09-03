// As regras da Caixa de Boost de XP por Level Up. Só função pura.
//
// A rede, o banco e a transação moram no serviço. Aqui fica o que decide o
// prêmio e o que decide quantas caixas uma compra gera, que são as duas
// contas em que um erro passa despercebido e sai caro.
//
// O SORTEIO É DO SERVIDOR, SEMPRE
//
// `sortearDrop` recebe um número entre 0 e 1 de quem chama, e quem chama usa
// `crypto.randomInt`. A função fica determinística e testável, e o acaso fica
// num lugar só, do lado do servidor. Nada disso atravessa o navegador: o
// cliente pede para abrir a caixa e recebe o resultado já gravado.

import type { LevelUpBoxRarity } from "@prisma/client";

/** Um multiplicador possível e a chance dele, em pontos percentuais. */
export interface DropDaCaixa {
  multiplier: number;
  rarity: LevelUpBoxRarity;
  chance: number;
}

/**
 * A tabela inicial, usada para semear um painel que ainda não configurou nada.
 *
 * A soma é 100 e o teste cobra isso: tabela que não fecha em 100 deixa uma
 * faixa do sorteio sem dono, e o sorteio precisaria de uma regra de desempate
 * inventada na hora.
 */
export const DROPS_PADRAO: readonly DropDaCaixa[] = [
  { multiplier: 1.5, rarity: "COMUM", chance: 30 },
  { multiplier: 1.7, rarity: "COMUM", chance: 22 },
  { multiplier: 2.0, rarity: "RARO", chance: 18 },
  { multiplier: 2.2, rarity: "RARO", chance: 11 },
  { multiplier: 2.5, rarity: "EPICO", chance: 8 },
  { multiplier: 2.7, rarity: "EPICO", chance: 5 },
  { multiplier: 3.0, rarity: "LENDARIO", chance: 3 },
  { multiplier: 3.2, rarity: "LENDARIO", chance: 2 },
  { multiplier: 3.5, rarity: "ULTRA_RARO", chance: 1 },
] as const;

/** Quantos minutos o boost vale depois de aberto, quando nada foi configurado. */
export const MINUTOS_PADRAO = 15;

export const ROTULO_DA_RARIDADE: Record<LevelUpBoxRarity, string> = {
  COMUM: "Comum",
  RARO: "Raro",
  EPICO: "Épico",
  LENDARIO: "Lendário",
  ULTRA_RARO: "Ultra raro",
};

/**
 * A soma das chances dos drops ATIVOS.
 *
 * Drop desligado não entra: ele existe na tabela para quem opera poder
 * religá-lo sem redigitar, e não participa do sorteio enquanto está fora.
 */
export function somaDasChances(drops: readonly DropDaCaixa[]): number {
  return drops.reduce((s, d) => s + (d.chance || 0), 0);
}

export type ConfiguracaoInvalida =
  | { ok: true }
  | { ok: false; erro: string };

/**
 * Confere se uma tabela de drops pode ser salva.
 *
 * Recusar aqui é melhor que corrigir na hora do sorteio: uma tabela que soma
 * 98 sorteada com "o resto cai no primeiro" transforma um erro de digitação
 * numa regra secreta de economia.
 */
export function conferirDrops(drops: readonly DropDaCaixa[]): ConfiguracaoInvalida {
  const ativos = drops.filter((d) => d.chance > 0);
  if (ativos.length === 0) {
    return { ok: false, erro: "Deixe pelo menos um multiplicador ativo." };
  }
  if (drops.some((d) => !(d.multiplier > 1))) {
    return {
      ok: false,
      erro: "Todo multiplicador precisa ser maior que 1: abaixo disso a caixa tiraria XP de quem ganhou.",
    };
  }
  if (drops.some((d) => !Number.isInteger(d.chance) || d.chance < 0)) {
    return { ok: false, erro: "As chances precisam ser números inteiros de 0 para cima." };
  }
  const soma = somaDasChances(ativos);
  if (soma !== 100) {
    return {
      ok: false,
      erro: `As chances dos multiplicadores ativos somam ${soma}%, e precisam somar exatamente 100%.`,
    };
  }
  const vistos = new Set<number>();
  for (const d of drops) {
    if (vistos.has(d.multiplier)) {
      return {
        ok: false,
        erro: `O multiplicador ${d.multiplier}x aparece duas vezes.`,
      };
    }
    vistos.add(d.multiplier);
  }
  return { ok: true };
}

/**
 * Escolhe um drop a partir de um sorteio já feito.
 *
 * `sorteio` é um número em [0, 1). A faixa de cada drop é proporcional à
 * chance dele, e a varredura é acumulativa: o primeiro cuja soma acumulada
 * ultrapassa o sorteio é o ganhador.
 *
 * Recebe o acaso pronto em vez de gerá-lo aqui por dois motivos: dá para
 * testar as bordas de cada faixa, e o gerador seguro fica num lugar só, no
 * servidor.
 */
export function sortearDrop(
  drops: readonly DropDaCaixa[],
  sorteio: number,
): DropDaCaixa | null {
  const ativos = drops.filter((d) => d.chance > 0);
  if (ativos.length === 0) return null;

  const total = somaDasChances(ativos);
  if (total <= 0) return null;

  // Fora de [0,1) vira borda, e não exceção: o chamador é o gerador do
  // servidor, e um número esquisito não pode deixar alguém sem prêmio.
  const posicao = Math.min(Math.max(sorteio, 0), 0.999999999) * total;

  let acumulado = 0;
  for (const drop of ativos) {
    acumulado += drop.chance;
    if (posicao < acumulado) return drop;
  }
  // Só chega aqui por erro de ponto flutuante na última fatia.
  return ativos[ativos.length - 1]!;
}

/**
 * Os níveis conquistados entre dois totais de XP.
 *
 * Uma compra que atravessa vários degraus gera uma caixa POR degrau: do 10
 * para o 13 saem as caixas 11, 12 e 13. Devolver só o nível final daria uma
 * caixa onde a pessoa conquistou três.
 *
 * Não sobe de nível, ou perde nível num estorno, devolve lista vazia.
 */
export function niveisConquistados(
  nivelAntes: number,
  nivelDepois: number,
): number[] {
  if (!Number.isFinite(nivelAntes) || !Number.isFinite(nivelDepois)) return [];
  if (nivelDepois <= nivelAntes) return [];
  const niveis: number[] = [];
  for (let n = Math.floor(nivelAntes) + 1; n <= Math.floor(nivelDepois); n++) {
    niveis.push(n);
  }
  return niveis;
}

/**
 * O XP com o boost do level up aplicado.
 *
 * ESTE É UM ESTÁGIO SEPARADO, E DE PROPÓSITO.
 *
 * O cálculo de compra do projeto SOMA os multiplicadores existentes
 * (atividade, faixa da compra, sorte) e limita o total em MAX_XP_MULTIPLIER,
 * que hoje é 2,5. Jogar o boost dentro daquela soma faria um 3,5x virar 2,5x
 * calado, e ainda mudaria o efeito das regras que já existem. Então o boost
 * multiplica o XP JÁ CALCULADO, num passo à parte, e o extrato guarda as duas
 * coisas separadas.
 *
 * Arredonda para baixo: XP é inteiro, e arredondar para cima daria um ponto
 * de graça em toda compra.
 */
export function aplicarBoost(
  xpJaCalculado: number,
  multiplicador: number,
): { finalXp: number; bonusXp: number } {
  if (!(xpJaCalculado > 0) || !(multiplicador > 1)) {
    return { finalXp: Math.max(0, Math.floor(xpJaCalculado || 0)), bonusXp: 0 };
  }
  const finalXp = Math.floor(xpJaCalculado * multiplicador);
  return { finalXp, bonusXp: finalXp - xpJaCalculado };
}
