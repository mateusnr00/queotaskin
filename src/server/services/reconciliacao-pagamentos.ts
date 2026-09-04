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
import type { PaymentProvider } from "@prisma/client";

import { prisma } from "@/lib/db";
import { chaveDeEvento } from "@/lib/pagamentos/idempotencia";
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

// ===========================================================================
// REVERIFICACAO DE LIQUIDACAO ATRASADA (settlement lag) - GATE 10K.
// ---------------------------------------------------------------------------
// Caso real (GATE 10I): a HorsePay enviou webhook HMAC valido de pagamento, mas
// a consulta autoritativa S2S ainda respondeu "pending" (lag de liquidacao).
// verifyPayment corretamente NAO aprovou (VERIFIED_PENDING) e a Reservation
// depois expirou. Sem ninguem reconsultando, o dinheiro do cliente ficaria
// preso PENDING para sempre - o backlog nunca era varrido automaticamente.
//
// Esta funcao agenda novas tentativas SEGURAS de verificacao reusando o MESMO
// choke point (processarWebhookDePagamento -> verifyPayment S2S -> politica ->
// FSM -> finalizarReservaPaga). Ela NUNCA escreve Payment.status; nunca e uma
// segunda fonte de verdade. A autoridade continua sendo o GET S2S do provider,
// e HORSEPAY so aprova com status=paid + valor exato (centavos) + identidade
// (id == externalId). O webhook continua sendo SINAL, nao prova.
//
// SEM TABELA NOVA: todo o estado duravel necessario ja existe.
//   - elegibilidade: um PaymentWebhookEvent com signatureValid=true e
//     verificationResult=VERIFIED_PENDING - um sinal de pagamento AUTENTICADO
//     cujo S2S ficou pendente. Fecha abuso: um PIX nunca pago nao tem esse
//     evento, e signatureValid=true so e gravado depois de a assinatura HMAC
//     conferir, o que um atacante sem o segredo nao consegue forjar.
//   - firstSignalAt: createdAt do primeiro sinal legitimo (idade do lag).
//   - lastAttemptAt: processedAt do evento de RECONCILIACAO (chave
//     deterministica), que o proprio choke point atualiza a cada tentativa.
//   - backoff/horizonte: derivados desses timestamps ja persistidos.
//
// Observacao (Guard ON): durante a Financial Maintenance, a FSM e recusada pelo
// banco, entao a tentativa nao seta processedAt (a transacao inteira reverte) e
// o pagamento permanece elegivel a cada passada. Isso e aceitavel: e uma janela
// de manutencao temporaria, o lote e limitado, e assim que a manutencao sai o
// pagamento e aprovado uma vez e deixa de ser PENDING (some da elegibilidade).
// ===========================================================================

const MIN_MS = 60_000;
const HORIZONTE_PADRAO_HORAS = 72;

/**
 * Espacamento minimo entre tentativas, por idade do sinal. Backoff crescente:
 * cedo reconsulta rapido (o dinheiro provavelmente ja entrou, so falta liquidar)
 * e depois espaca, para nao marretar o gateway num pagamento que talvez nunca
 * liquide. A cadencia efetiva tambem e limitada pelo periodo do cron.
 */
export function espacamentoDeReverificacaoMs(idadeMs: number): number {
  if (idadeMs <= 5 * MIN_MS) return 1 * MIN_MS; // T<=5min:  no maximo a cada 1min
  if (idadeMs <= 30 * MIN_MS) return 5 * MIN_MS; // <=30min: a cada 5min
  if (idadeMs <= 2 * 60 * MIN_MS) return 15 * MIN_MS; // <=2h:  a cada 15min
  if (idadeMs <= 24 * 60 * MIN_MS) return 60 * MIN_MS; // <=24h: a cada 60min
  return 6 * 60 * MIN_MS; // >24h ate o horizonte: a cada 6h
}

export interface OpcoesDeReverificacao {
  /** Teto de itens por passada (1..500). */
  limite?: number;
  /** Fora deste horizonte o pagamento sai da fila automatica (vai para
   *  reconciliacao manual). Default 72h. */
  horizonteHoras?: number;
  /** Injetavel para teste deterministico. */
  agora?: number;
  /** Restringe o sweep a estes externalId (reconciliacao DIRIGIDA e testes
   *  hermeticos). Em producao o cron chama sem filtro, varrendo todo o
   *  backlog elegivel. */
  apenasExternalIds?: string[];
}

export interface ResultadoDeReverificacao {
  elegiveis: number;
  devidos: number;
  verificados: number;
  aprovados: number;
  reconciliacao: number;
  seguemPendentes: number;
  ignorados: number;
}

export async function reverificarPagamentosComLag(
  opcoes: OpcoesDeReverificacao = {},
  deps: DepsDaVerificacao = {},
): Promise<ResultadoDeReverificacao> {
  const limite = Math.min(Math.max(opcoes.limite ?? 100, 1), 500);
  const horizonteMs =
    Math.min(Math.max(opcoes.horizonteHoras ?? HORIZONTE_PADRAO_HORAS, 1), 168) * 3_600_000;
  const agora = opcoes.agora ?? Date.now();

  const r: ResultadoDeReverificacao = {
    elegiveis: 0, devidos: 0, verificados: 0, aprovados: 0, reconciliacao: 0, seguemPendentes: 0, ignorados: 0,
  };

  // 1. Sinais de pagamento AUTENTICADOS cujo S2S ficou pendente, no horizonte.
  const sinais = await prisma.paymentWebhookEvent.findMany({
    where: {
      signatureValid: true,
      verificationResult: "VERIFIED_PENDING",
      createdAt: { gte: new Date(agora - horizonteMs) },
      ...(opcoes.apenasExternalIds ? { externalId: { in: opcoes.apenasExternalIds } } : {}),
    },
    select: { externalId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (sinais.length === 0) return r;

  const primeiroSinal = new Map<string, number>(); // externalId -> firstSignalAt (ms)
  for (const s of sinais) {
    const t = s.createdAt.getTime();
    const atual = primeiroSinal.get(s.externalId);
    if (atual === undefined || t < atual) primeiroSinal.set(s.externalId, t);
  }

  // 2. So os que AINDA estao PENDING (Payment e a fonte de verdade do estado).
  const pendentes = await prisma.payment.findMany({
    where: { status: "PENDING", externalId: { in: [...primeiroSinal.keys()] } },
    select: { externalId: true, provider: true },
  });
  if (pendentes.length === 0) return r;

  // 3. Ultima tentativa: processedAt do evento de RECONCILIACAO (chave estavel).
  const chavePorExternal = new Map<string, string>();
  for (const p of pendentes) {
    chavePorExternal.set(
      p.externalId,
      chaveDeEvento({ provider: p.provider, transacao: p.externalId, status: "RECONCILIACAO", eventoOficial: null }),
    );
  }
  const reconEventos = await prisma.paymentWebhookEvent.findMany({
    where: { providerEventId: { in: [...chavePorExternal.values()] } },
    select: { providerEventId: true, processedAt: true },
  });
  const ultimaPorChave = new Map<string, number>();
  for (const e of reconEventos) {
    if (e.providerEventId && e.processedAt) ultimaPorChave.set(e.providerEventId, e.processedAt.getTime());
  }

  // 4. Elegiveis (dentro do horizonte) e DEVIDOS (backoff cumprido).
  const devidos: { externalId: string; provider: PaymentProvider; firstSignalAt: number }[] = [];
  for (const p of pendentes) {
    const firstSignalAt = primeiroSinal.get(p.externalId)!;
    const idade = agora - firstSignalAt;
    if (idade > horizonteMs) continue; // fora do horizonte: reconciliacao manual
    r.elegiveis++;
    const ultima = ultimaPorChave.get(chavePorExternal.get(p.externalId)!);
    if (ultima === undefined || agora - ultima >= espacamentoDeReverificacaoMs(idade)) {
      devidos.push({ externalId: p.externalId, provider: p.provider, firstSignalAt });
    }
  }

  // 5. Mais antigos primeiro; teto por passada.
  devidos.sort((a, b) => a.firstSignalAt - b.firstSignalAt);
  const lote = devidos.slice(0, limite);
  r.devidos = lote.length;

  // 6. Reprocessa CADA um pelo choke point oficial. externalId SEMPRE do banco,
  //    nunca da request. Nenhuma aprovacao acontece aqui: quem decide e a FSM,
  //    subordinada a politica de tier, ao kill switch e ao Financial Guard.
  for (const d of lote) {
    r.verificados++;
    try {
      const { desfecho } = await processarWebhookDePagamento(
        {
          evento: { provider: d.provider, externalId: d.externalId, statusAfirmado: "RECONCILIACAO", eventoOficial: null },
          corpoCru: "",
          payload: { fonte: "reverificacao-lag" },
          assinaturaValida: null,
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
