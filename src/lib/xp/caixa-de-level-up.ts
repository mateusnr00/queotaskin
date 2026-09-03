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

/**
 * Um resultado possível da caixa.
 *
 * A chance é em PONTOS-BASE: 3000 é 30%, 125 é 1,25%. Inteiro de propósito,
 * porque probabilidade somada em ponto flutuante não fecha em 100 de forma
 * confiável, e a regra deste sistema é que ela feche exatamente.
 *
 * A cor é do drop, não da raridade: a paleta é decisão de quem opera.
 */
export interface DropDaCaixa {
  multiplier: number;
  rarity: LevelUpBoxRarity;
  probabilityBps: number;
  color: string;
}

/** Cem por cento, em pontos-base. */
export const TOTAL_EM_BPS = 10_000;

/** Pontos-base para o percentual que a tela mostra: 3000 vira "30". */
export function bpsParaPorcento(bps: number): number {
  return Math.round((bps / 100) * 100) / 100;
}

/** O caminho de volta: "1,25" vira 125. */
export function porcentoParaBps(porcento: number): number {
  return Math.round(porcento * 100);
}

/**
 * Uma cor HEX aceitável.
 *
 * Só #RGB e #RRGGBB. Nomes de cor do CSS ficam de fora porque a mesma string
 * precisa servir ao seletor nativo do navegador, que só entende hexadecimal
 * de seis dígitos.
 */
export function corValida(cor: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cor.trim());
}

/**
 * A tabela inicial, usada para semear um painel que ainda não configurou nada.
 *
 * A soma é 100 e o teste cobra isso: tabela que não fecha em 100 deixa uma
 * faixa do sorteio sem dono, e o sorteio precisaria de uma regra de desempate
 * inventada na hora.
 */
export const DROPS_PADRAO: readonly DropDaCaixa[] = [
  { multiplier: 1.5, rarity: "COMUM", probabilityBps: 3000, color: "#A1A1AA" },
  { multiplier: 1.7, rarity: "COMUM", probabilityBps: 2200, color: "#D4D4D8" },
  { multiplier: 2.0, rarity: "RARO", probabilityBps: 1800, color: "#38BDF8" },
  { multiplier: 2.2, rarity: "RARO", probabilityBps: 1100, color: "#22D3EE" },
  { multiplier: 2.5, rarity: "EPICO", probabilityBps: 800, color: "#A78BFA" },
  { multiplier: 2.7, rarity: "EPICO", probabilityBps: 500, color: "#C084FC" },
  { multiplier: 3.0, rarity: "LENDARIO", probabilityBps: 300, color: "#FBBF24" },
  { multiplier: 3.2, rarity: "LENDARIO", probabilityBps: 200, color: "#FB923C" },
  { multiplier: 3.5, rarity: "ULTRA_RARO", probabilityBps: 100, color: "#FF4655" },
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
  return drops.reduce((s, d) => s + (d.probabilityBps || 0), 0);
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
  const ativos = drops.filter((d) => d.probabilityBps > 0);
  if (ativos.length === 0) {
    return { ok: false, erro: "Deixe pelo menos um multiplicador ativo." };
  }
  if (drops.some((d) => !(d.multiplier > 1))) {
    return {
      ok: false,
      erro: "Todo multiplicador precisa ser maior que 1: abaixo disso a caixa tiraria XP de quem ganhou.",
    };
  }
  if (drops.some((d) => !Number.isInteger(d.probabilityBps) || d.probabilityBps < 0)) {
    return { ok: false, erro: "As chances precisam ser positivas." };
  }
  const semCor = drops.find((d) => !corValida(d.color));
  if (semCor) {
    return {
      ok: false,
      erro: `A cor de ${semCor.multiplier}x não é um hexadecimal válido. Use algo como #FF4655.`,
    };
  }
  const soma = somaDasChances(ativos);
  if (soma !== TOTAL_EM_BPS) {
    return {
      ok: false,
      erro: `As chances dos multiplicadores ativos somam ${bpsParaPorcento(soma)}%, e precisam somar exatamente 100%.`,
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
  const ativos = drops.filter((d) => d.probabilityBps > 0);
  if (ativos.length === 0) return null;

  const total = somaDasChances(ativos);
  if (total <= 0) return null;

  // Fora de [0,1) vira borda, e não exceção: o chamador é o gerador do
  // servidor, e um número esquisito não pode deixar alguém sem prêmio.
  const posicao = Math.min(Math.max(sorteio, 0), 0.999999999) * total;

  let acumulado = 0;
  for (const drop of ativos) {
    acumulado += drop.probabilityBps;
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
