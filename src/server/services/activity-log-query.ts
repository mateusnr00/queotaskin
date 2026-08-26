// Leitura e manutenção do registro de atividade.
//
// Separado do serviço de escrita de propósito: registrarLog é importado por
// quase toda server action do projeto, e não deve arrastar junto o código de
// paginação e limpeza que só a tela e o cron usam.

import type { ActivityLog, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { TipoDeAlvo } from "@/lib/activity-log-actions";

export type Cursor = { criadoEm: Date; id: string };

export interface FiltroDeLogs {
  /**
   * Painel a filtrar. NULO SIGNIFICA TODOS, e é reservado ao SUPER_ADMIN.
   * Quem chama tem que resolver isso a partir da sessão, nunca de parâmetro
   * vindo do cliente.
   */
  tenantId: string | null;
  acao?: string;
  actorId?: string;
  alvo?: { tipo: TipoDeAlvo; id: string };
  de?: Date;
  ate?: Date;
  cursor?: Cursor;
  limite?: number;
}

const LIMITE_PADRAO = 50;

export const RETENCAO_DIAS = 365;

/** Tamanho do lote da limpeza, para não segurar a rota de cron. */
const LOTE_DE_LIMPEZA = 1000;

/** Teto de lotes por execução, contra laço infinito se algo der errado. */
const LOTES_POR_EXECUCAO = 20;

export function montarWhere(filtro: FiltroDeLogs): Prisma.ActivityLogWhereInput {
  const where: Prisma.ActivityLogWhereInput = {};

  if (filtro.tenantId) where.tenantId = filtro.tenantId;
  if (filtro.acao) where.acao = filtro.acao;
  if (filtro.actorId) where.actorId = filtro.actorId;
  if (filtro.alvo) {
    where.alvoTipo = filtro.alvo.tipo;
    where.alvoId = filtro.alvo.id;
  }
  if (filtro.de || filtro.ate) {
    where.criadoEm = {
      ...(filtro.de ? { gte: filtro.de } : {}),
      ...(filtro.ate ? { lte: filtro.ate } : {}),
    };
  }

  // Cursor comparando data E id. Só a data pularia registros: várias linhas
  // podem cair no mesmo milissegundo, e o `lt` deixaria as irmãs para trás.
  if (filtro.cursor) {
    where.OR = [
      { criadoEm: { lt: filtro.cursor.criadoEm } },
      { criadoEm: filtro.cursor.criadoEm, id: { lt: filtro.cursor.id } },
    ];
  }

  return where;
}

/**
 * Página de registros, do mais novo para o mais velho.
 *
 * Paginação por cursor, e não por deslocamento: a tabela recebe linhas novas
 * no topo o tempo todo, então `skip` faria a página 2 repetir o que a 1 já
 * tinha mostrado.
 */
export async function listarLogs(
  filtro: FiltroDeLogs
): Promise<{ registros: ActivityLog[]; proximo: Cursor | null }> {
  const limite = filtro.limite ?? LIMITE_PADRAO;

  // Pede um a mais só para saber se existe página seguinte, sem um count.
  const linhas = await prisma.activityLog.findMany({
    where: montarWhere(filtro),
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    take: limite + 1,
  });

  const temMais = linhas.length > limite;
  const registros = temMais ? linhas.slice(0, limite) : linhas;
  const ultimo = registros[registros.length - 1];

  return {
    registros,
    proximo: temMais && ultimo ? { criadoEm: ultimo.criadoEm, id: ultimo.id } : null,
  };
}

/**
 * Apaga o que passou da retenção.
 *
 * A consulta ao registro mais antigo vem antes de qualquer deleção: na
 * imensa maioria das execuções não há nada para apagar, e sair por aqui custa
 * uma leitura de índice em vez de um DELETE varrendo a tabela a cada cinco
 * minutos.
 */
export async function limparLogsAntigos(
  agora: Date = new Date()
): Promise<{ apagados: number }> {
  const corte = new Date(agora.getTime() - RETENCAO_DIAS * 24 * 60 * 60 * 1000);

  const maisAntigo = await prisma.activityLog.findFirst({
    orderBy: { criadoEm: "asc" },
    select: { criadoEm: true },
  });
  if (!maisAntigo || maisAntigo.criadoEm >= corte) return { apagados: 0 };

  let apagados = 0;
  for (let lote = 0; lote < LOTES_POR_EXECUCAO; lote++) {
    const alvos = await prisma.activityLog.findMany({
      where: { criadoEm: { lt: corte } },
      select: { id: true },
      take: LOTE_DE_LIMPEZA,
    });
    if (alvos.length === 0) break;

    const r = await prisma.activityLog.deleteMany({
      where: { id: { in: alvos.map((a) => a.id) } },
    });
    apagados += r.count;

    if (alvos.length < LOTE_DE_LIMPEZA) break;
  }

  return { apagados };
}
