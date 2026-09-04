// RECONCILIADOR DE PAGAMENTOS PENDENTES (FASE 4.10).
//
// Recuperacao DETERMINISTICA do backlog: apos a janela de manutencao (ou
// sempre que webhooks se perderem), varre pagamentos PENDING e reprocessa cada
// um pelo choke point unico, que verifica no gateway (server-to-server). Nao
// depende do gateway reenviar o webhook nem do cliente reabrir a pagina.
//
// Batch SEGURO (nao consulta tudo indiscriminadamente):
//   - teto de itens por passada (limite, 1..500);
//   - janela de idade: ignora pagamentos jovens demais (evita corrida com o
//     fluxo normal) e velhos demais (fora do horizonte de recuperacao);
//   - mais antigos primeiro, sequencial, para nao marretar o gateway.
//
// A politica de aprovacao continua no choke point: STRONG autoaprova (valor
// conferido), STATUS_ONLY fica PENDING, kill switch/guard mandam. Aqui so
// disparamos a verificacao; nao decidimos nada sobre o dinheiro.
import { prisma } from "@/lib/db";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";
import type { DepsDaVerificacao } from "@/server/services/payment-verification";

export interface OpcoesDeReconciliacao {
  limite?: number;
  idadeMinimaMinutos?: number;
  idadeMaximaHoras?: number;
}

export interface ResultadoDeReconciliacao {
  verificados: number;
  aprovados: number;
  reconciliacao: number;
  seguemPendentes: number;
  ignorados: number;
}

export async function reconciliarPagamentosPendentes(
  opcoes: OpcoesDeReconciliacao = {},
  deps: DepsDaVerificacao = {},
): Promise<ResultadoDeReconciliacao> {
  const limite = Math.min(Math.max(opcoes.limite ?? 50, 1), 500);
  const idadeMinMs = Math.max(opcoes.idadeMinimaMinutos ?? 0, 0) * 60_000;
  const idadeMaxMs = Math.max(opcoes.idadeMaximaHoras ?? 72, 1) * 3_600_000;
  const agora = Date.now();

  const pendentes = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      createdAt: {
        gte: new Date(agora - idadeMaxMs),
        lte: new Date(agora - idadeMinMs),
      },
    },
    select: { externalId: true, provider: true },
    orderBy: { createdAt: "asc" },
    take: limite,
  });

  const r: ResultadoDeReconciliacao = {
    verificados: 0, aprovados: 0, reconciliacao: 0, seguemPendentes: 0, ignorados: 0,
  };

  for (const p of pendentes) {
    r.verificados++;
    try {
      const { desfecho } = await processarWebhookDePagamento(
        {
          evento: {
            provider: p.provider,
            externalId: p.externalId,
            statusAfirmado: "RECONCILIACAO",
            eventoOficial: null,
          },
          corpoCru: "",
          payload: {},
          assinaturaValida: true,
        },
        deps,
      );
      if (desfecho === "APROVADO") r.aprovados++;
      else if (desfecho === "RECONCILIACAO") r.reconciliacao++;
      else if (desfecho === "PENDENTE" || desfecho === "JA_PROCESSADO") r.seguemPendentes++;
      else r.ignorados++;
    } catch {
      r.ignorados++;
    }
  }
  return r;
}
