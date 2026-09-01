// As regras do programa de afiliados que não precisam de banco.
//
// Ficam aqui, puras e testadas, pelo mesmo motivo que a distribuição de
// prêmios ficou em lib/distribuicao.ts: dinheiro e recompensa não podem
// depender de rodar uma compra de verdade para saber se estão certos. O que
// precisa de banco (cadeado, transação, corrida entre duas abas) mora em
// server/services/afiliados.ts.
//
// TUDO EM CENTAVOS, INTEIRO.
//
// R$ 10,00 é 1000. Somar 0.1 + 0.2 em ponto flutuante dá 0.30000000000000004,
// e num programa que acumula centavo a centavo até fechar dez reais isso vira
// entrada a mais ou a menos no fim do mês. O banco guarda Int pela mesma
// razão.

/**
 * A CONFIGURAÇÃO PADRÃO DO PROGRAMA.
 *
 * A cada R$ 10 pagos pelos indicados, um cupom de R$ 5. Cinquenta por cento,
 * dito em basis points para não existir float em nenhuma conta de dinheiro:
 * 5000 bps é 50%, 7000 é 70%, 10000 é 100%.
 *
 * Cada afiliado pode ter a sua própria configuração no painel; estes são os
 * valores de quem não foi configurado.
 */
export const LIMIAR_PADRAO_EM_CENTAVOS = 1000;
export const RECOMPENSA_PADRAO_EM_BPS = 5000;
export const VALOR_PADRAO_DO_CUPOM_EM_CENTAVOS = 500;

/** Cem por cento, em basis points. O denominador de toda conta daqui. */
const BPS_CHEIO = 10_000;

/**
 * A PROGRESSÃO POR GASTO DO INDICADO.
 *
 * A cada R$ 100 que UMA pessoa indicada gasta, o percentual do afiliado sobe
 * dois pontos. Os dois números são configuráveis por afiliado, e não estão
 * cravados na conta: amanhã pode ser "a cada R$ 200, mais 1%".
 */
export const DEGRAU_PADRAO_EM_CENTAVOS = 10_000;
export const BPS_PADRAO_POR_DEGRAU = 200;

export type ModoDeRecompensa = "VALOR_FIXO" | "PERCENTUAL_PROGRESSIVO";

export interface ConfigDeRecompensa {
  modo: ModoDeRecompensa;
  limiarEmCentavos: number;
  recompensaEmBps: number;
  valorDoCupomEmCentavos: number;
  /** A cada quantos centavos gastos por um indicado o percentual sobe. */
  degrauEmCentavos: number;
  /** Quanto sobe por degrau, em basis points. */
  bpsPorDegrau: number;
}

export const CONFIG_PADRAO: ConfigDeRecompensa = {
  modo: "VALOR_FIXO",
  limiarEmCentavos: LIMIAR_PADRAO_EM_CENTAVOS,
  recompensaEmBps: RECOMPENSA_PADRAO_EM_BPS,
  valorDoCupomEmCentavos: VALOR_PADRAO_DO_CUPOM_EM_CENTAVOS,
  degrauEmCentavos: DEGRAU_PADRAO_EM_CENTAVOS,
  bpsPorDegrau: BPS_PADRAO_POR_DEGRAU,
};

export interface ProgressaoDoIndicado {
  /** Quanto essa pessoa já gastou, em centavos. */
  gastoEmCentavos: number;
  /** Degraus fechados. R$ 199,99 com degrau de R$ 100 dá 1. */
  degraus: number;
  /** O percentual atual, em basis points. */
  bps: number;
  /** Em quanto de gasto acumulado o próximo degrau fecha, em centavos. */
  proximoDegrauEmCentavos: number;
  /** Quanto falta gastar para o próximo degrau, em centavos. */
  faltaEmCentavos: number;
}

/**
 * Onde uma pessoa indicada está na progressão.
 *
 * SEM ARREDONDAMENTO, e é isso que a regra pede: R$ 199,99 fecharam UM degrau,
 * não dois. `Math.floor` sobre centavos inteiros faz isso sem chance de erro
 * de ponto flutuante, que é o defeito clássico desta conta (1,99 * 100 dá
 * 198.99999999999997 em float, e o degrau sumiria).
 *
 * O percentual tem teto de 100%: acima disso o cupom valeria mais do que o
 * dinheiro que entrou, e o programa deixaria de se pagar.
 */
export function progressaoDoIndicado({
  gastoEmCentavos,
  degrauEmCentavos = DEGRAU_PADRAO_EM_CENTAVOS,
  bpsPorDegrau = BPS_PADRAO_POR_DEGRAU,
}: {
  gastoEmCentavos: number;
  degrauEmCentavos?: number;
  bpsPorDegrau?: number;
}): ProgressaoDoIndicado {
  if (degrauEmCentavos <= 0) {
    throw new Error("O degrau da progressão precisa ser maior que zero");
  }
  const gasto = Math.max(0, Math.floor(gastoEmCentavos));
  const degraus = Math.floor(gasto / degrauEmCentavos);
  const bps = Math.min(BPS_CHEIO, degraus * bpsPorDegrau);
  const proximo = (degraus + 1) * degrauEmCentavos;

  return {
    gastoEmCentavos: gasto,
    degraus,
    bps,
    proximoDegrauEmCentavos: proximo,
    faltaEmCentavos: proximo - gasto,
  };
}

/**
 * O valor do cupom que sai de um limiar e uma porcentagem.
 *
 * Arredonda para baixo de propósito: 33% de R$ 10 dá R$ 3,33 e não R$ 3,34.
 * Pagar um centavo a mais por cupom, multiplicado por milhares, é dinheiro que
 * ninguém autorizou.
 */
export function valorDoCupom(
  limiarEmCentavos: number,
  recompensaEmBps: number,
): number {
  return Math.floor((limiarEmCentavos * recompensaEmBps) / BPS_CHEIO);
}

/**
 * O caminho inverso: que porcentagem um valor de cupom representa.
 *
 * O painel deixa editar os dois campos, e um recalcula o outro. Quem manda é
 * sempre o backend: a tela mostra a conta, ela não é a conta.
 */
export function bpsDoValorDoCupom(
  limiarEmCentavos: number,
  valorDoCupomEmCentavos: number,
): number {
  if (limiarEmCentavos <= 0) return 0;
  return Math.round((valorDoCupomEmCentavos * BPS_CHEIO) / limiarEmCentavos);
}

/** Basis points para porcentagem legível. 5000 → 50. */
export function porcentagemDosBps(bps: number): number {
  return bps / 100;
}

/** Porcentagem digitada para basis points. 50 → 5000; 7,5 → 750. */
export function bpsDaPorcentagem(porcentagem: number): number {
  return Math.round(porcentagem * 100);
}

export interface ProblemaNaConfig {
  campo: "limiar" | "bps" | "valor" | "degrau" | "bpsPorDegrau";
  mensagem: string;
}

/**
 * A configuração faz sentido?
 *
 * Roda no servidor antes de gravar, e o painel usa a mesma função para avisar
 * enquanto se digita. Limiar zero dividiria por zero na hora de contar cupons;
 * cupom zero seria uma recompensa que não recompensa; e valor acima do limiar
 * é recompensa maior que 100%, que é dar mais do que entrou.
 */
export function conferirConfig(
  config: ConfigDeRecompensa,
): ProblemaNaConfig | null {
  if (config.modo === "PERCENTUAL_PROGRESSIVO") {
    // No modo progressivo o valor do cupom não é digitado: ele sai do gasto
    // de cada indicado na hora da concessão. O que se configura é a escada.
    if (!Number.isInteger(config.degrauEmCentavos) || config.degrauEmCentavos <= 0) {
      return { campo: "degrau", mensagem: "O degrau precisa ser maior que zero" };
    }
    if (!Number.isInteger(config.bpsPorDegrau) || config.bpsPorDegrau <= 0) {
      return {
        campo: "bpsPorDegrau",
        mensagem: "O aumento por degrau precisa ser maior que zero",
      };
    }
    if (config.bpsPorDegrau > BPS_CHEIO) {
      return {
        campo: "bpsPorDegrau",
        mensagem: "O aumento por degrau não pode passar de 100%",
      };
    }
    if (!Number.isInteger(config.limiarEmCentavos) || config.limiarEmCentavos <= 0) {
      return { campo: "limiar", mensagem: "O limiar precisa ser maior que zero" };
    }
    return null;
  }

  if (!Number.isInteger(config.limiarEmCentavos) || config.limiarEmCentavos <= 0) {
    return { campo: "limiar", mensagem: "O limiar precisa ser maior que zero" };
  }
  if (!Number.isInteger(config.recompensaEmBps) || config.recompensaEmBps <= 0) {
    return { campo: "bps", mensagem: "A recompensa precisa ser maior que zero" };
  }
  if (config.recompensaEmBps > BPS_CHEIO) {
    return {
      campo: "bps",
      mensagem: "A recompensa não pode passar de 100%",
    };
  }
  if (
    !Number.isInteger(config.valorDoCupomEmCentavos) ||
    config.valorDoCupomEmCentavos <= 0
  ) {
    return { campo: "valor", mensagem: "O cupom precisa valer mais que zero" };
  }
  // O valor gravado tem que ser o que a porcentagem produz. Salvar os dois
  // sem conferir deixaria a tela dizendo 50% e o cupom saindo por outro valor.
  const esperado = valorDoCupom(config.limiarEmCentavos, config.recompensaEmBps);
  if (config.valorDoCupomEmCentavos !== esperado) {
    return {
      campo: "valor",
      mensagem: "O valor do cupom não bate com a porcentagem",
    };
  }
  return null;
}

export interface Recompensa {
  /** Quantos cupons esta entrada de dinheiro liberou. */
  cupons: number;
  /** O que sobra guardado para o próximo, em centavos. */
  progressoRestante: number;
}

/**
 * Quantos cupons este dinheiro libera, e o que sobra para o próximo.
 *
 * PROGRESSIVO: cada limiar alcançado vale um cupom, e o resto fica acumulado
 * sem perder centavo. R$ 27,50 com limiar de R$ 10 dão dois cupons e deixam
 * R$ 7,50; os R$ 2,50 seguintes fecham o terceiro.
 *
 * Todos os indicados do mesmo afiliado somam no mesmo progresso: um pagou
 * R$ 4, outro pagou R$ 6, e o cupom sai.
 *
 * Valor negativo é aceito de propósito, e é assim que o estorno desfaz o que
 * uma compra somou. O resultado pode ser progresso NEGATIVO: é dívida, ela
 * fica registrada, e quem chama decide o que fazer com os cupons que já saíram.
 */
export function calcularRecompensa({
  progressoAnterior,
  valorEmCentavos,
  limiarEmCentavos = LIMIAR_PADRAO_EM_CENTAVOS,
}: {
  progressoAnterior: number;
  valorEmCentavos: number;
  limiarEmCentavos?: number;
}): Recompensa {
  if (limiarEmCentavos <= 0) {
    throw new Error("O limiar da recompensa precisa ser maior que zero");
  }

  const total = progressoAnterior + valorEmCentavos;
  if (total < 0) {
    // Dívida: nenhum cupom, e o negativo continua visível para quem cobra.
    return { cupons: 0, progressoRestante: total };
  }

  return {
    cupons: Math.floor(total / limiarEmCentavos),
    progressoRestante: total % limiarEmCentavos,
  };
}

/**
 * Quanto o cupom abate desta cota.
 *
 * Abate ATÉ o valor de face, em UMA cota só:
 *
 *   cota de R$ 2 com cupom de R$ 5   abate R$ 2, e os R$ 3 se perdem
 *   cota de R$ 5 com cupom de R$ 5   abate R$ 5, e a cota fica zerada
 *   cota de R$ 12 com cupom de R$ 5  abate R$ 5, e a pessoa paga R$ 7
 *
 * Não existe troco, saldo, divisão entre cotas nem soma de dois cupons. O que
 * sobra do valor de face simplesmente não é aproveitado, e a tela avisa isso
 * antes de a pessoa confirmar.
 */
export function descontoDoCupom({
  precoDaCotaEmCentavos,
  valorDoCupomEmCentavos,
}: {
  precoDaCotaEmCentavos: number;
  valorDoCupomEmCentavos: number;
}): { descontoEmCentavos: number; desperdicioEmCentavos: number } {
  if (precoDaCotaEmCentavos <= 0 || valorDoCupomEmCentavos <= 0) {
    return { descontoEmCentavos: 0, desperdicioEmCentavos: 0 };
  }
  const desconto = Math.min(valorDoCupomEmCentavos, precoDaCotaEmCentavos);
  return {
    descontoEmCentavos: desconto,
    desperdicioEmCentavos: valorDoCupomEmCentavos - desconto,
  };
}

/** Quanto tempo o código de quem indicou sobrevive até o cadastro. */
/**
 * QUANTO TEMPO O CUPOM DURA DEPOIS DE CAIR NA MÃO.
 *
 * Setenta e duas horas contadas da concessão. O prazo existe para o cupom
 * virar movimento: cupom sem validade vira um crédito parado que a pessoa
 * lembra de gastar seis meses depois, e quem divulgou não vê o indicado
 * jogando. Três dias é curto para pressionar e longo para caber num fim de
 * semana inteiro, que é quando o público está no jogo.
 *
 * Cupom com prazo NULO não expira. É o caso dos concedidos antes desta regra
 * e dos ajustes manuais do painel: quem dá um cupom na mão está resolvendo
 * uma situação específica, e um prazo silencioso ali só criaria reclamação.
 */
export const HORAS_PARA_USAR_O_CUPOM = 72;

/** Quando um cupom concedido agora deixa de valer. */
export function expiracaoDoCupom(ganhaEm: Date): Date {
  return new Date(ganhaEm.getTime() + HORAS_PARA_USAR_O_CUPOM * 60 * 60 * 1000);
}

/** Já passou da hora? Prazo nulo é cupom sem validade, e nunca expira. */
export function cupomExpirado(
  expiraEm: Date | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!expiraEm) return false;
  return expiraEm.getTime() <= agora.getTime();
}

/**
 * O que falta, quebrado em horas, minutos e segundos, para a contagem.
 *
 * Devolve zeros depois do prazo, e nunca número negativo: a tela que recebe
 * "-3h" desenha "-3h", e ninguém quer ler isso.
 */
export function tempoRestante(
  expiraEm: Date,
  agora: Date = new Date(),
): { horas: number; minutos: number; segundos: number; acabou: boolean } {
  const ms = expiraEm.getTime() - agora.getTime();
  if (ms <= 0) return { horas: 0, minutos: 0, segundos: 0, acabou: true };
  const total = Math.floor(ms / 1000);
  return {
    horas: Math.floor(total / 3600),
    minutos: Math.floor((total % 3600) / 60),
    segundos: total % 60,
    acabou: false,
  };
}

export const DIAS_DO_COOKIE_DE_INDICACAO = 30;

/** O cookie que carrega o código entre a chegada pelo link e o cadastro. */
export const COOKIE_DE_INDICACAO = "qos_ref";

/** O maior código aceito. Cabe na tela e no boca a boca. */
export const TAMANHO_MAXIMO_DO_CODIGO = 20;
const TAMANHO_MINIMO_DO_CODIGO = 4;

/**
 * O código como ele é guardado e comparado.
 *
 * Maiúsculas, sem acento, sem espaço, só A-Z, 0-9 e _. Quem digita
 * "mateus 7k" no campo e quem recebe "MATEUS7K" no WhatsApp precisam chegar
 * no mesmo afiliado: comparar o que veio cru faria o primeiro não achar
 * ninguém e o cadastro sair sem vínculo, em silêncio.
 *
 * Devolve string vazia quando não sobrou nada aproveitável.
 */
export function normalizarCodigo(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, TAMANHO_MAXIMO_DO_CODIGO);
}

/** Um código digitado serve? Vale para o campo do cadastro e para o painel. */
export function codigoValido(bruto: string): boolean {
  const limpo = normalizarCodigo(bruto);
  return limpo.length >= TAMANHO_MINIMO_DO_CODIGO;
}

/**
 * Um código a partir do nome da pessoa, para quando o admin não escolhe um.
 *
 * "Mateus Nascimento" vira "MATEUS" mais um sufixo curto. O sufixo não é
 * enfeite: dois "Lucas Silva" no mesmo tenant colidiriam no índice unique, e
 * o cadastro do segundo afiliado falharia sem explicação.
 */
export function codigoSugerido(nome: string, sufixo: string): string {
  const base = normalizarCodigo(nome.split(/\s+/)[0] ?? "").slice(0, 10);
  const limpo = normalizarCodigo(sufixo).slice(0, 4);
  const junto = `${base || "AFILIADO"}${limpo}`;
  return junto.slice(0, TAMANHO_MAXIMO_DO_CODIGO);
}

/** Reais (o que o banco guarda como Decimal) para centavos inteiros. */
export function emCentavos(valorEmReais: number): number {
  return Math.round(valorEmReais * 100);
}

/** Centavos para reais, para formatar na tela. */
export function emReais(centavos: number): number {
  return centavos / 100;
}

/** O link que o afiliado compartilha. */
export function linkDeIndicacao(origem: string, codigo: string): string {
  const base = origem.replace(/\/+$/, "");
  return `${base}/?ref=${codigo}`;
}
