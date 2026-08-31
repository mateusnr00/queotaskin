// Serviços de estatística do painel (Início + Relatórios).
//
// Cada função responde a uma pergunta do painel a partir de dados que já
// existem e já são indexados, sem migration por trás de nada aqui. Os
// cálculos de período vêm de `@/lib/periodo` (puros e testados); o que mora
// aqui é a consulta e a forma final que a tela consome.
//
// Convenções:
// - "faturamento" e "vendas" contam só reserva PAGA (status PAID).
// - o recorte de tenant entra por relação (`raffle: { tenantId }`) nas
//   consultas de reserva, e por coluna direta em visita/ticket.
// - Decimal do Prisma vira number com Number(x ?? 0) na fronteira.

import { prisma } from "@/lib/db";
import { CANAIS } from "@/lib/canais-de-campanha";
import { taxaTotal, type FaixaDeTaxa } from "@/lib/taxa-de-gateway";
import {
  chaveDoBucket,
  escolherGranularidade,
  periodoAnterior,
  rotuloDoBucket,
  variacaoPercentual,
  type Granularidade,
} from "@/lib/periodo";

interface RecorteDePeriodo {
  tenantId: string;
  from: Date;
  to: Date;
  /** Um sorteio específico, ou todos quando ausente. */
  raffleId?: string;
}

/** part/whole em %, arredondado. Null quando o todo é zero (evita 0/0 e ∞). */
function percentual(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 100);
}

const ROTULO_POR_CANAL = new Map(CANAIS.map((c) => [c.id, c.rotulo]));

/** O rótulo legível de um utm_content. Vazio/nulo é tráfego sem origem. */
function rotuloDoCanal(canal: string | null): string {
  if (!canal) return "Direto";
  return ROTULO_POR_CANAL.get(canal) ?? canal;
}

/**
 * O where das reservas pagas de um período, com o recorte de tenant/sorteio.
 *
 * Aprovação no painel fica de fora. É uma reserva paga para todo o resto do
 * sistema (os títulos valem, o prêmio sai, o comprovante existe), mas o
 * dinheiro dela não passou por gateway nenhum: é cortesia, acerto por fora ou
 * teste. Contá-la aqui faz a receita do mês crescer sem ninguém ter pago, e
 * quem confere o extrato do gateway não acha a diferença.
 */
function wherePagasNoPeriodo({ tenantId, from, to, raffleId }: RecorteDePeriodo) {
  return {
    status: "PAID" as const,
    aprovadaNoPainel: false,
    paidAt: { gte: from, lte: to },
    raffle: { tenantId },
    ...(raffleId ? { raffleId } : {}),
  };
}

/** As mesmas reservas, mas só as aprovadas no painel. Para a nota da tela. */
function whereAprovadasNoPainel(opts: RecorteDePeriodo) {
  return { ...wherePagasNoPeriodo(opts), aprovadaNoPainel: true };
}

// ---------------------------------------------------------------------------
// Série de vendas no tempo (gráfico principal)
// ---------------------------------------------------------------------------

export interface PontoDeVenda {
  chave: string;
  rotulo: string;
  faturamento: number;
  reservas: number;
  titulos: number;
}

export interface SerieDeVendas {
  pontos: PontoDeVenda[];
  granularidade: Granularidade;
}

/**
 * Vendas pagas agrupadas por dia/semana/mês conforme o tamanho do período.
 * A granularidade é escolhida sozinha para o eixo não estourar em 180 colunas.
 */
export async function serieDeVendas(
  opts: RecorteDePeriodo,
): Promise<SerieDeVendas> {
  const granularidade = escolherGranularidade(opts.from, opts.to);
  const reservas = await prisma.reservation.findMany({
    where: wherePagasNoPeriodo(opts),
    select: {
      paidAt: true,
      totalAmount: true,
      _count: { select: { tickets: true } },
    },
    orderBy: { paidAt: "asc" },
  });

  const mapa = new Map<
    string,
    { faturamento: number; reservas: number; titulos: number }
  >();
  for (const r of reservas) {
    if (!r.paidAt) continue;
    const chave = chaveDoBucket(r.paidAt, granularidade);
    const entrada = mapa.get(chave) ?? {
      faturamento: 0,
      reservas: 0,
      titulos: 0,
    };
    entrada.faturamento += Number(r.totalAmount ?? 0);
    entrada.reservas += 1;
    entrada.titulos += r._count.tickets;
    mapa.set(chave, entrada);
  }

  const pontos = [...mapa.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([chave, v]) => ({
      chave,
      rotulo: rotuloDoBucket(chave, granularidade),
      ...v,
    }));

  return { pontos, granularidade };
}

// ---------------------------------------------------------------------------
// Funil de conversão (visitantes -> reservas -> pagas)
// ---------------------------------------------------------------------------

export interface FunilDeConversao {
  visitantes: number;
  reservas: number;
  pagas: number;
  /** reservas / visitantes */
  taxaReservaPct: number | null;
  /** pagas / reservas */
  taxaPagamentoPct: number | null;
  /** pagas / visitantes */
  taxaGeralPct: number | null;
}

/**
 * O funil do período. `visitantes` é a soma dos visitantes únicos por dia
 * (o denominador honesto que o VisitaDiaria já guarda); reservas e pagas são
 * contadas por quando a reserva foi criada, para alinhar a coorte ao período.
 */
export async function funilDeConversao(
  opts: RecorteDePeriodo,
): Promise<FunilDeConversao> {
  const { tenantId, from, to, raffleId } = opts;
  const whereBase = {
    raffle: { tenantId },
    createdAt: { gte: from, lte: to },
    ...(raffleId ? { raffleId } : {}),
  };

  const [visitas, reservas, pagas] = await Promise.all([
    prisma.visitaDiaria.aggregate({
      where: { tenantId, dia: { gte: from, lte: to } },
      _sum: { visitantes: true },
    }),
    prisma.reservation.count({ where: whereBase }),
    prisma.reservation.count({ where: { ...whereBase, status: "PAID" } }),
  ]);

  const visitantes = visitas._sum.visitantes ?? 0;

  return {
    visitantes,
    reservas,
    pagas,
    taxaReservaPct: percentual(reservas, visitantes),
    taxaPagamentoPct: percentual(pagas, reservas),
    taxaGeralPct: percentual(pagas, visitantes),
  };
}

// ---------------------------------------------------------------------------
// Faturamento por canal (UTM)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// O que sai do faturamento antes de virar dinheiro na conta
// ---------------------------------------------------------------------------

export interface AbatimentosDoPeriodo {
  /** Quanto os gateways ficaram, somando faixa por faixa. */
  taxas: number;
  /**
   * Pagamentos cujo gateway não tem faixa cadastrada.
   *
   * Eles entram no faturamento e saem da conta de taxa, então o líquido fica
   * otimista. A tela precisa dizer isso: número incompleto apresentado como
   * final é pior do que número nenhum.
   */
  semTaxa: number;
  /** As aprovações feitas no painel, que ficaram fora do faturamento. */
  manuais: { quantidade: number; valor: number };
}

/**
 * Taxas de gateway e aprovações manuais do período.
 *
 * As duas coisas juntas porque respondem à mesma pergunta: por que o número da
 * tela não é o número do extrato. Uma parte o gateway ficou, a outra nunca
 * existiu.
 */
export async function abatimentosDoPeriodo(
  opts: RecorteDePeriodo,
): Promise<AbatimentosDoPeriodo> {
  const [faixas, pagas, manuais] = await Promise.all([
    prisma.taxaDeGateway.findMany({
      where: { tenantId: opts.tenantId },
      select: { provider: true, apartirDe: true, percentual: true, fixo: true },
    }),
    prisma.reservation.findMany({
      where: wherePagasNoPeriodo(opts),
      select: {
        totalAmount: true,
        payment: { select: { provider: true } },
      },
    }),
    prisma.reservation.aggregate({
      where: whereAprovadasNoPainel(opts),
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
  ]);

  const porProvider = new Map<string, FaixaDeTaxa[]>();
  for (const f of faixas) {
    const lista = porProvider.get(f.provider) ?? [];
    lista.push({
      apartirDe: Number(f.apartirDe),
      percentual: Number(f.percentual),
      fixo: Number(f.fixo),
    });
    porProvider.set(f.provider, lista);
  }

  const { total, semTaxa } = taxaTotal(
    pagas.map((r) => ({
      valor: Number(r.totalAmount),
      provider: r.payment?.provider ?? null,
    })),
    porProvider,
  );

  return {
    taxas: total,
    semTaxa,
    manuais: {
      quantidade: manuais._count._all,
      valor: Number(manuais._sum.totalAmount ?? 0),
    },
  };
}

export interface CanalFaturamento {
  canal: string;
  rotulo: string;
  faturamento: number;
  compras: number;
}

/** Faturamento pago agrupado pelo canal (utm_content) da venda, maior primeiro. */
export async function faturamentoPorCanal(
  opts: RecorteDePeriodo,
): Promise<CanalFaturamento[]> {
  const grupos = await prisma.reservation.groupBy({
    by: ["utmContent"],
    where: wherePagasNoPeriodo(opts),
    _sum: { totalAmount: true },
    _count: { _all: true },
  });

  return grupos
    .map((g) => ({
      canal: g.utmContent ?? "",
      rotulo: rotuloDoCanal(g.utmContent),
      faturamento: Number(g._sum.totalAmount ?? 0),
      compras: g._count._all,
    }))
    .sort((a, b) => b.faturamento - a.faturamento);
}

// ---------------------------------------------------------------------------
// Reservas em risco (agora)
// ---------------------------------------------------------------------------

export interface ReservasEmRisco {
  /** Pendentes que ainda não expiraram: dinheiro em trânsito. */
  pendentes: number;
  valorPendente: number;
  /** Expiradas na janela recente. */
  expiradas: number;
  pagasNaJanela: number;
  /** expiradas / (expiradas + pagas) na janela. */
  taxaExpiracaoPct: number | null;
}

export async function reservasEmRisco(opts: {
  tenantId: string;
  now?: Date;
  janelaDias?: number;
}): Promise<ReservasEmRisco> {
  const now = opts.now ?? new Date();
  const janelaDias = opts.janelaDias ?? 7;
  const desde = new Date(now.getTime() - janelaDias * 24 * 60 * 60 * 1000);
  const tenant = { raffle: { tenantId: opts.tenantId } };

  const [pendentesAgg, expiradas, pagas] = await Promise.all([
    prisma.reservation.aggregate({
      where: { ...tenant, status: "PENDING", expiresAt: { gt: now } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.reservation.count({
      where: { ...tenant, status: "EXPIRED", createdAt: { gte: desde } },
    }),
    prisma.reservation.count({
      where: { ...tenant, status: "PAID", createdAt: { gte: desde } },
    }),
  ]);

  return {
    pendentes: pendentesAgg._count._all,
    valorPendente: Number(pendentesAgg._sum.totalAmount ?? 0),
    expiradas,
    pagasNaJanela: pagas,
    taxaExpiracaoPct: percentual(expiradas, expiradas + pagas),
  };
}

// ---------------------------------------------------------------------------
// Progresso das campanhas ativas (% de títulos vendidos)
// ---------------------------------------------------------------------------

export interface ProgressoCampanha {
  id: string;
  titulo: string;
  vendidos: number;
  total: number;
  pct: number;
}

/**
 * Para cada sorteio ativo, quanto dos números já foi vendido. "Vendido" conta
 * título PAGO ou PREMIADO (AWARDED também saiu de reserva paga); reservado sem
 * pagar não entra, porque a barra mede venda, não ocupação temporária.
 */
export async function progressoDasCampanhas(
  tenantId: string,
): Promise<ProgressoCampanha[]> {
  const sorteios = await prisma.raffle.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true, title: true, totalNumbers: true },
    orderBy: { createdAt: "desc" },
  });

  const progresso = await Promise.all(
    sorteios.map(async (s) => {
      const vendidos = await prisma.ticket.count({
        where: { raffleId: s.id, status: { in: ["PAID", "AWARDED"] } },
      });
      const pct =
        s.totalNumbers > 0
          ? Math.min(100, Math.round((vendidos / s.totalNumbers) * 100))
          : 0;
      return {
        id: s.id,
        titulo: s.title,
        vendidos,
        total: s.totalNumbers,
        pct,
      };
    }),
  );

  return progresso.sort((a, b) => b.pct - a.pct);
}

// ---------------------------------------------------------------------------
// Totais do período + comparativo com o período anterior
// ---------------------------------------------------------------------------

export interface Totais {
  faturamento: number;
  reservas: number;
  titulos: number;
  ticketMedio: number;
}

export interface Comparativo {
  atual: Totais;
  anterior: Totais;
  variacao: {
    faturamento: number | null;
    reservas: number | null;
    titulos: number | null;
    ticketMedio: number | null;
  };
}

async function totaisDoPeriodo(opts: RecorteDePeriodo): Promise<Totais> {
  const reservas = await prisma.reservation.findMany({
    where: wherePagasNoPeriodo(opts),
    select: { totalAmount: true, _count: { select: { tickets: true } } },
  });

  const faturamento = reservas.reduce((s, r) => s + Number(r.totalAmount ?? 0), 0);
  const titulos = reservas.reduce((s, r) => s + r._count.tickets, 0);
  const qtd = reservas.length;
  return {
    faturamento,
    reservas: qtd,
    titulos,
    ticketMedio: qtd > 0 ? faturamento / qtd : 0,
  };
}

/** Totais do período e a variação percentual contra o período anterior. */
export async function totaisComparativo(
  opts: RecorteDePeriodo,
): Promise<Comparativo> {
  const anteriorRange = periodoAnterior(opts.from, opts.to);
  const [atual, anterior] = await Promise.all([
    totaisDoPeriodo(opts),
    totaisDoPeriodo({
      tenantId: opts.tenantId,
      raffleId: opts.raffleId,
      from: anteriorRange.from,
      to: anteriorRange.to,
    }),
  ]);

  return {
    atual,
    anterior,
    variacao: {
      faturamento: variacaoPercentual(atual.faturamento, anterior.faturamento),
      reservas: variacaoPercentual(atual.reservas, anterior.reservas),
      titulos: variacaoPercentual(atual.titulos, anterior.titulos),
      ticketMedio: variacaoPercentual(atual.ticketMedio, anterior.ticketMedio),
    },
  };
}

// ---------------------------------------------------------------------------
// Método de pagamento (Pix vs cartão vs boleto)
// ---------------------------------------------------------------------------

const ROTULO_POR_METODO: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão",
  BOLETO: "Boleto",
};

export interface MetodoFaturamento {
  metodo: string;
  rotulo: string;
  faturamento: number;
  compras: number;
}

/** Faturamento pago quebrado por método de pagamento, maior primeiro. */
export async function metodoDePagamento(
  opts: RecorteDePeriodo,
): Promise<MetodoFaturamento[]> {
  const reservas = await prisma.reservation.findMany({
    where: wherePagasNoPeriodo(opts),
    select: { totalAmount: true, payment: { select: { method: true } } },
  });

  const mapa = new Map<string, { faturamento: number; compras: number }>();
  for (const r of reservas) {
    const metodo = r.payment?.method;
    if (!metodo) continue;
    const entrada = mapa.get(metodo) ?? { faturamento: 0, compras: 0 };
    entrada.faturamento += Number(r.totalAmount ?? 0);
    entrada.compras += 1;
    mapa.set(metodo, entrada);
  }

  return [...mapa.entries()]
    .map(([metodo, v]) => ({
      metodo,
      rotulo: ROTULO_POR_METODO[metodo] ?? metodo,
      ...v,
    }))
    .sort((a, b) => b.faturamento - a.faturamento);
}
