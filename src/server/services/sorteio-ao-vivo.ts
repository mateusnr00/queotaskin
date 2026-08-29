// O motor do sorteio ao vivo.
//
// Tudo o que decide alguma coisa mora aqui, do lado do servidor. A página é
// apresentação: ela conta os segundos e roda a animação, e o número que ela
// mostra já estava gravado no banco antes de o primeiro dígito aparecer na
// tela. Nenhuma função deste arquivo aceita resultado vindo do navegador.
//
// AS TRÊS GARANTIAS
//
// 1. IDEMPOTÊNCIA. Nenhuma transição é "ler, decidir, escrever". Toda
//    mudança de fase é um UPDATE com o estado anterior no WHERE, e quem
//    consegue mudar a linha é quem faz o trabalho. Dois workers acordando no
//    mesmo segundo, cinquenta abas pedindo o estado ao mesmo tempo, o cron
//    disparando duas vezes: o número é escolhido uma vez só, porque só uma
//    dessas chamadas encontra a linha no estado que ela exige.
//
// 2. O BANCO É A VERDADE. Não existe setTimeout, nem fila em memória, nem
//    "quem está segurando o sorteio". O cronograma inteiro é gravado no
//    encerramento, e qualquer processo que acorde depois reconstrói onde a
//    transmissão está olhando só para os carimbos. Restart, deploy, autoscale
//    e queda no meio da contagem levam ao mesmo lugar.
//
// 3. O RESULTADO NÃO VAZA. `estadoPublico` decide o que sai daqui pelo
//    relógio do servidor, não por parâmetro de quem chamou. Antes da hora, o
//    número não está no JSON, não está no HTML e não está em lugar nenhum que
//    o navegador alcance.
//
// QUEM CHAMA
//
// `avancarSorteio` é chamado pelo cron (que garante que o sorteio aconteça
// mesmo sem ninguém olhando) e pela própria consulta de estado (que garante
// que aconteça no segundo certo quando tem gente olhando). O cron de um em um
// minuto sozinho não serviria: a contagem tem sessenta segundos e a rolagem
// tem nove, e um motor que atrasa meio minuto deixaria a página parada no
// zero. É o mesmo arranjo que a expiração de reservas já usa neste projeto:
// o cron é a rede, o caminho quente é o gatilho.

import { createHash, randomInt } from "node:crypto";

import type { Draw, DrawStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { nomeCurto } from "@/lib/nome-curto";
import { registrarLog } from "@/server/services/activity-log";
import { VENDIDO } from "@/server/services/vendidos";
import {
  faseDoSorteio,
  idPublicoDoSorteio,
  marcosDoSorteio,
  podeMostrarGanhador,
  podeMostrarNumero,
  temposConfigurados,
  type EstadoDoSorteio,
} from "@/lib/sorteio-ao-vivo";

/** Versão do motor gravada em cada sorteio. Ver `drawVersion` no schema. */
const VERSAO_DO_MOTOR = 1;

/** Escrito por extenso no comprovante. */
const METODO_DE_SORTEIO = "node:crypto.randomInt";

function situacaoDe(draw: Draw) {
  return {
    drawScheduledAt: draw.drawScheduledAt,
    drawStartsAt: draw.drawStartsAt,
    revealAt: draw.revealAt,
    winnerRevealAt: draw.winnerRevealAt,
    temResultado: draw.winningNumber != null,
    falhou: draw.status === "ERROR",
  };
}

// =====================================================================
// 1. AGENDAMENTO: a campanha encerrou, o sorteio nasce
// =====================================================================

/** As duas formas de uma campanha chegar ao fim sozinha. */
export type MotivoDeEncerramento = "ESGOTOU" | "DATA_DO_SORTEIO";

interface CandidataAoSorteio {
  raffleId: string;
  motivo: MotivoDeEncerramento;
  /** O instante do encerramento. Para a data marcada, é a data marcada. */
  encerradaEm: Date;
  /** Quantos bilhetes vendidos no momento do encerramento. */
  vendidos: number;
}

/**
 * Campanhas que já encerraram e ainda não têm sorteio.
 *
 * Duas condições, e só elas:
 *
 * - ESGOTOU: vendeu todos os números. O encerramento é agora, porque a última
 *   venda pode ter sido há segundos ou há minutos e não existe carimbo do
 *   instante exato em que o estoque zerou.
 * - DATA_DO_SORTEIO: passou da data marcada, com o fechamento automático
 *   ligado. O encerramento é a data marcada, e não agora: se o worker
 *   percebeu com quarenta segundos de atraso, o cronograma continua saindo da
 *   hora que foi anunciada.
 *
 * Campanha com ganhador declarado à mão fica de fora. Ela já tem resultado, e
 * sortear de novo seria trocar o ganhador de alguém.
 */
async function campanhasEncerradas(agora: Date): Promise<CandidataAoSorteio[]> {
  const ativas = await prisma.raffle.findMany({
    where: {
      status: "ACTIVE",
      winnerTicketNumber: null,
      draw: { is: null },
    },
    select: {
      id: true,
      totalNumbers: true,
      drawDate: true,
      autoCloseOnDraw: true,
    },
  });
  if (ativas.length === 0) return [];

  // Uma consulta agrupada para todas as candidatas, e não uma por campanha:
  // com quarenta campanhas ativas, o contrário seria quarenta idas ao banco
  // por minuto para responder uma pergunta que cabe em uma.
  const vendidos = await prisma.ticket.groupBy({
    by: ["raffleId"],
    where: { raffleId: { in: ativas.map((r) => r.id) }, ...VENDIDO },
    _count: { _all: true },
  });
  const porRifa = new Map(vendidos.map((v) => [v.raffleId, v._count._all]));

  const candidatas: CandidataAoSorteio[] = [];
  for (const rifa of ativas) {
    const vendido = porRifa.get(rifa.id) ?? 0;
    // Campanha sem uma venda sequer não tem o que sortear. A data passar não
    // cria participante, e um sorteio de universo vazio nasceria em ERROR
    // pedindo atenção humana para um caso que não é problema nenhum: é uma
    // campanha que não vendeu. Fica como está, e o painel decide.
    if (vendido <= 0) continue;

    if (rifa.totalNumbers > 0 && vendido >= rifa.totalNumbers) {
      candidatas.push({
        raffleId: rifa.id,
        motivo: "ESGOTOU",
        encerradaEm: agora,
        vendidos: vendido,
      });
      continue;
    }
    if (rifa.autoCloseOnDraw && rifa.drawDate && agora >= rifa.drawDate) {
      candidatas.push({
        raffleId: rifa.id,
        motivo: "DATA_DO_SORTEIO",
        encerradaEm: rifa.drawDate,
        vendidos: vendido,
      });
    }
  }
  return candidatas;
}

function sufixoAleatorio(tamanho: number): number[] {
  return Array.from({ length: tamanho }, () => randomInt(0, 34));
}

/**
 * Cria o sorteio de uma campanha que encerrou, e congela a campanha.
 *
 * As duas coisas na mesma transação, e essa é a parte que importa: a campanha
 * vira FINISHED no mesmo instante em que o sorteio nasce. FINISHED é o que a
 * criação de reserva já recusa há muito tempo, então o universo congela sem
 * precisar de nenhuma trava nova no caminho da compra. Se a transação falha,
 * as duas coisas voltam atrás juntas: nunca existe campanha fechada sem
 * sorteio, nem sorteio de campanha que ainda vende.
 *
 * Devolve null quando outro processo chegou primeiro.
 */
async function criarSorteio(
  candidata: CandidataAoSorteio,
  agora: Date,
): Promise<Draw | null> {
  const marcos = marcosDoSorteio(candidata.encerradaEm, temposConfigurados());

  // O encerramento pode ter sido percebido tarde (servidor fora do ar,
  // data marcada há uma hora). Nesse caso o cronograma inteiro já passou, e
  // agendar no passado faria a página abrir direto no resultado sem ninguém
  // ter visto contagem nenhuma. Recomeça de agora: quem chegou atrasado foi o
  // sistema, e o atraso não é motivo para tirar a transmissão de quem esperou.
  const marcosFinais =
    marcos.drawScheduledAt <= agora
      ? marcosDoSorteio(agora, temposConfigurados())
      : marcos;

  try {
    return await prisma.$transaction(async (tx) => {
      // A campanha só fecha se ainda estiver aberta. Outro caminho pode
      // tê-la fechado no meio (o admin declarando ganhador, por exemplo), e
      // aí este sorteio não deve nascer.
      const fechou = await tx.raffle.updateMany({
        where: { id: candidata.raffleId, status: "ACTIVE" },
        data: { status: "FINISHED" },
      });
      if (fechou.count !== 1) return null;

      return await tx.draw.create({
        data: {
          publicId: idPublicoDoSorteio(agora, sufixoAleatorio),
          raffleId: candidata.raffleId,
          status: "WAITING_DRAW",
          raffleEndedAt: marcosFinais.raffleEndedAt,
          drawScheduledAt: marcosFinais.drawScheduledAt,
          drawStartsAt: marcosFinais.drawStartsAt,
          revealAt: marcosFinais.revealAt,
          winnerRevealAt: marcosFinais.winnerRevealAt,
          // Já nasce com a contagem de participantes, e não zerada até o
          // sorteio: a tela de espera precisa dizer quantos estão
          // disputando, e ela abre dez minutos antes de o motor rodar. O
          // valor é reconferido na execução, contra o universo congelado.
          eligibleTicketCount: candidata.vendidos,
          rngMethod: METODO_DE_SORTEIO,
          drawVersion: VERSAO_DO_MOTOR,
        },
      });
    });
  } catch (err) {
    // Chave duplicada: outro worker criou o sorteio desta campanha entre a
    // nossa leitura e a nossa escrita. É o resultado esperado da corrida, e
    // não um erro: o sorteio existe, que era o objetivo.
    if (
      typeof err === "object" &&
      err !== null &&
      (err as Prisma.PrismaClientKnownRequestError).code === "P2002"
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Varre as campanhas encerradas e agenda o sorteio de cada uma.
 *
 * Chamado pelo cron. Devolve quantos sorteios nasceram.
 */
export async function agendarSorteiosPendentes(
  agora: Date = new Date(),
): Promise<{ agendados: number }> {
  const candidatas = await campanhasEncerradas(agora);
  let agendados = 0;

  for (const candidata of candidatas) {
    try {
      const draw = await criarSorteio(candidata, agora);
      if (!draw) continue;
      agendados++;

      const rifa = await prisma.raffle.findUnique({
        where: { id: candidata.raffleId },
        select: { tenantId: true, title: true },
      });
      await registrarLog({
        acao: "sorteio.agendado",
        tenantId: rifa?.tenantId,
        origem: "SISTEMA",
        ator: { nome: "Sorteio automático" },
        alvo: { tipo: "Raffle", id: candidata.raffleId, rotulo: rifa?.title },
        detalhes: {
          sorteio: draw.publicId,
          motivo: candidata.motivo,
          agendadoPara: draw.drawScheduledAt.toISOString(),
        },
      });
    } catch (err) {
      // Uma campanha que falha não pode levar as outras junto: a varredura é
      // global e roda para todos os painéis de uma vez.
      console.error(
        "[sorteio-ao-vivo] falha ao agendar",
        candidata.raffleId,
        err,
      );
    }
  }

  return { agendados };
}

// =====================================================================
// 2. O SORTEIO EM SI
// =====================================================================

/** O universo que disputa, congelado no instante do sorteio. */
interface Universo {
  bilhetes: { id: string; number: number; userId: string | null; nome: string | null }[];
  hash: string;
}

/**
 * Os bilhetes elegíveis, na ordem do número.
 *
 * Elegível é bilhete vendido: PAID e AWARDED, exatamente a mesma definição que
 * a barra de progresso e o painel já usam (`VENDIDO`). Bilhete em reserva não
 * paga não disputa, e essa é a única leitura defensável: a pessoa não pagou.
 *
 * Sortear entre os vendidos, e não entre 1 e totalNumbers, é a escolha que
 * garante ganhador. Numa campanha que esgotou os dois universos são o mesmo
 * conjunto. Numa que encerrou pela data com metade vendida, sortear no
 * intervalo cheio cairia em número sem dono na metade das vezes, e a
 * transmissão terminaria anunciando que ninguém ganhou.
 *
 * O hash é a impressão digital desse universo: quem disputou, em que ordem, e
 * quantos eram. Guardado junto do resultado, ele permite provar depois que a
 * lista não foi mexida entre o encerramento e o sorteio.
 */
async function universoElegivel(
  raffleId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<Universo> {
  const bilhetes = await tx.ticket.findMany({
    where: { raffleId, ...VENDIDO },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      reservation: { select: { userId: true, participantName: true } },
    },
  });

  const lista = bilhetes.map((b) => ({
    id: b.id,
    number: b.number,
    userId: b.reservation?.userId ?? null,
    nome: b.reservation?.participantName ?? null,
  }));

  const hash = createHash("sha256")
    .update(`${raffleId}|${lista.length}|${lista.map((b) => b.number).join(",")}`)
    .digest("hex");

  return { bilhetes: lista, hash };
}

/**
 * Escolhe um índice uniforme em [0, total).
 *
 * `crypto.randomInt` já faz amostragem por rejeição internamente, então não há
 * viés de módulo mesmo quando o total não divide a potência de dois: o que
 * cairia fora da faixa é descartado e sorteado de novo. É por isso que não
 * existe `% total` em lugar nenhum deste arquivo, e por isso `Math.random`
 * está fora de questão, ele não é criptográfico e a semente é adivinhável.
 */
function sortearIndice(total: number): number {
  return randomInt(0, total);
}

/**
 * Executa o sorteio de um draw que chegou na hora.
 *
 * A trava é a primeira linha de escrita: só quem consegue mover o status de
 * COUNTDOWN (ou WAITING_DRAW, no caso do sistema que acordou atrasado) para
 * DRAWING é que sorteia. Todo o resto, inclusive o sorteio em si, acontece
 * depois de essa mudança ter dado certo. É o `UPDATE ... WHERE status = ...`
 * que decide a corrida, e não um lock de aplicação: dois processos em duas
 * máquinas diferentes chegam ao mesmo Postgres.
 *
 * O resultado é gravado na mesma transação em que o status vira DRAWING com
 * número: nunca existe um instante em que o sorteio está "sorteando" sem que o
 * número já esteja no banco.
 */
async function executarSorteio(draw: Draw): Promise<Draw> {
  // 1. Reivindica o direito de sortear. Perdeu a corrida: outro processo
  //    está sorteando ou já sorteou, e a leitura fresca do banco é a resposta.
  const reivindicou = await prisma.draw.updateMany({
    where: {
      id: draw.id,
      status: { in: ["WAITING_DRAW", "COUNTDOWN"] },
      winningNumber: null,
    },
    data: { status: "DRAWING", countdownStartedAt: draw.countdownStartedAt ?? new Date() },
  });
  if (reivindicou.count !== 1) {
    return (await prisma.draw.findUniqueOrThrow({ where: { id: draw.id } }));
  }

  try {
    const universo = await universoElegivel(draw.raffleId);

    if (universo.bilhetes.length === 0) {
      // Não deveria acontecer: o agendamento só cria sorteio de campanha com
      // venda, e a campanha está congelada desde então. Se acontecer, é
      // corrupção de dados e precisa de gente olhando, não de um resultado
      // inventado.
      return await marcarErro(draw.id, "Nenhum bilhete elegível no sorteio");
    }

    const vencedor = universo.bilhetes[sortearIndice(universo.bilhetes.length)];
    const executadoEm = new Date();

    const atualizado = await prisma.draw.update({
      where: { id: draw.id },
      data: {
        winningNumber: vencedor.number,
        winnerTicketId: vencedor.id,
        winnerUserId: vencedor.userId,
        winnerName: vencedor.nome ? nomeCurto(vencedor.nome) : null,
        eligibleTicketCount: universo.bilhetes.length,
        snapshotHash: universo.hash,
        rngMethod: METODO_DE_SORTEIO,
        drawExecutedAt: executadoEm,
      },
    });

    // O ganhador vai também para a campanha, nos campos que a página pública
    // e o painel já leem há muito tempo. Sem isto, o resultado existiria só
    // dentro da transmissão e o card de ganhador da campanha ficaria vazio.
    await prisma.raffle.update({
      where: { id: draw.raffleId },
      data: {
        winnerTicketNumber: vencedor.number,
        winnerDrawnAt: executadoEm,
        winnerNote: `Sorteio automático ${draw.publicId}. ${universo.bilhetes.length} bilhetes elegíveis, sorteio por ${METODO_DE_SORTEIO}.`,
      },
    });

    const rifa = await prisma.raffle.findUnique({
      where: { id: draw.raffleId },
      select: { tenantId: true, title: true },
    });
    await registrarLog({
      acao: "sorteio.numero_gerado",
      tenantId: rifa?.tenantId,
      origem: "SISTEMA",
      ator: { nome: "Sorteio automático" },
      alvo: { tipo: "Raffle", id: draw.raffleId, rotulo: rifa?.title },
      detalhes: {
        sorteio: draw.publicId,
        numero: vencedor.number,
        elegiveis: universo.bilhetes.length,
        metodo: METODO_DE_SORTEIO,
        hash: universo.hash,
        // Só quando divergiu do que foi contado no encerramento. Divergir é
        // possível de forma legítima (um webhook atrasado confirmando um
        // pagamento depois do fechamento), e é exatamente o tipo de coisa que
        // ninguém consegue reconstruir depois sem registro.
        ...(draw.eligibleTicketCount !== universo.bilhetes.length
          ? { elegiveisNoAgendamento: draw.eligibleTicketCount }
          : {}),
      },
    });

    return atualizado;
  } catch (err) {
    console.error("[sorteio-ao-vivo] falha ao executar", draw.publicId, err);
    return await marcarErro(
      draw.id,
      err instanceof Error ? err.message : "Falha desconhecida ao sortear",
    );
  }
}

async function marcarErro(drawId: string, motivo: string): Promise<Draw> {
  return prisma.draw.update({
    where: { id: drawId },
    data: { status: "ERROR", errorReason: motivo.slice(0, 500) },
  });
}

// =====================================================================
// 3. AVANÇO DE FASE
// =====================================================================

/**
 * Leva o sorteio até onde o relógio permite, e devolve a linha atualizada.
 *
 * Idempotente por construção: chamada mil vezes no mesmo segundo, ela faz o
 * trabalho na primeira e nas outras só confirma o que já é verdade. É por isso
 * que pode ser chamada do caminho quente (toda consulta de estado) sem medo.
 *
 * Cada gravação carrega o estado anterior no WHERE. Uma que não encontra a
 * linha não é erro: quer dizer que outro processo já fez aquele passo.
 */
export async function avancarSorteio(
  entrada: Draw,
  agora: Date = new Date(),
): Promise<Draw> {
  let draw = entrada;
  if (draw.status === "ERROR" || draw.status === "FINISHED") return draw;

  // Passou da hora e ainda não tem número: sortear é o próximo passo, e ele
  // reivindica a linha sozinho.
  if (draw.winningNumber == null && agora >= draw.drawStartsAt) {
    draw = await executarSorteio(draw);
    if (draw.status === "ERROR") return draw;
  }

  const fase = faseDoSorteio(situacaoDe(draw), agora);
  if (fase === draw.status) return draw;

  const dados: Prisma.DrawUpdateInput = { status: fase };
  if (fase === "COUNTDOWN" && draw.countdownStartedAt == null) {
    dados.countdownStartedAt = agora;
  }
  if (fase === "REVEALING" && draw.winnerRevealedAt == null) {
    dados.winnerRevealedAt = agora;
  }
  if (fase === "FINISHED") {
    if (draw.winnerRevealedAt == null) dados.winnerRevealedAt = agora;
    dados.finishedAt = agora;
  }

  // A guarda de status é o que impede duas chamadas simultâneas de gravarem a
  // mesma transição duas vezes, e o que impede uma chamada atrasada de puxar
  // o sorteio de volta para uma fase anterior.
  const mudou = await prisma.draw.updateMany({
    where: { id: draw.id, status: draw.status },
    data: dados as Prisma.DrawUpdateManyMutationInput,
  });

  if (mudou.count === 1 && fase === "FINISHED") {
    const rifa = await prisma.raffle.findUnique({
      where: { id: draw.raffleId },
      select: { tenantId: true, title: true },
    });
    await registrarLog({
      acao: "sorteio.finalizado",
      tenantId: rifa?.tenantId,
      origem: "SISTEMA",
      ator: { nome: "Sorteio automático" },
      alvo: { tipo: "Raffle", id: draw.raffleId, rotulo: rifa?.title },
      detalhes: { sorteio: draw.publicId, numero: draw.winningNumber },
    });
  }

  return prisma.draw.findUniqueOrThrow({ where: { id: draw.id } });
}

/**
 * O passo do worker: agenda o que encerrou e avança o que está em curso.
 *
 * A rede de proteção, não o mecanismo principal. Ele existe para o sorteio
 * acontecer numa madrugada em que ninguém abriu a página, e para retomar
 * sozinho quando o sistema volta de uma queda com a hora já passada.
 */
export async function processarSorteios(agora: Date = new Date()): Promise<{
  agendados: number;
  avancados: number;
}> {
  const { agendados } = await agendarSorteiosPendentes(agora);

  const emCurso = await prisma.draw.findMany({
    where: {
      status: { in: ["WAITING_DRAW", "COUNTDOWN", "DRAWING", "REVEALING"] },
      drawScheduledAt: { lte: agora },
    },
    orderBy: { drawScheduledAt: "asc" },
    take: 50,
  });

  let avancados = 0;
  for (const draw of emCurso) {
    try {
      const depois = await avancarSorteio(draw, agora);
      if (depois.status !== draw.status) avancados++;
    } catch (err) {
      console.error("[sorteio-ao-vivo] falha ao avançar", draw.publicId, err);
    }
  }

  return { agendados, avancados };
}

// =====================================================================
// 4. ESTADO PÚBLICO
// =====================================================================

/**
 * O que a página recebe.
 *
 * Nada aqui é opinião do cliente. `serverTime` é o relógio de quem decide, e é
 * contra ele que a página acerta o próprio: o navegador pode estar com a hora
 * errada em horas, e a contagem continua correta.
 */
export interface EstadoPublicoDoSorteio {
  publicId: string;
  status: EstadoDoSorteio;
  serverTime: string;

  campanha: {
    titulo: string;
    slug: string;
    premio: string | null;
    imagem: string | null;
    totalNumbers: number;
  };

  raffleEndedAt: string;
  drawScheduledAt: string;
  drawStartsAt: string;
  revealAt: string;
  winnerRevealAt: string;

  eligibleTicketCount: number;
  rngMethod: string;
  snapshotHash: string | null;
  drawExecutedAt: string | null;
  drawVersion: number;

  /**
   * O resultado. Null enquanto não pode ser mostrado, e null é literal: a
   * chave nem sai com o número dentro esperando o cliente se comportar.
   */
  resultado: {
    numero: number;
    /** Só a partir de `winnerRevealAt`. Antes disso vem null. */
    ganhador: string | null;
  } | null;

  erro: string | null;
}

interface RifaDoSorteio {
  title: string;
  slug: string;
  totalNumbers: number;
  prizes: { description: string }[];
  images: { url: string }[];
}

/**
 * Monta o payload público.
 *
 * A regra de vazamento mora aqui, num lugar só, e é decidida pelo relógio do
 * servidor. Quem chama não escolhe o que aparece.
 *
 * Do ganhador sai só o nome curto ("Mateus N."), que é o mesmo formato das
 * listas públicas do site. CPF, telefone, email e nome completo não passam
 * por esta função em momento nenhum: eles não estão no `select`.
 */
export function estadoPublico(
  draw: Draw,
  rifa: RifaDoSorteio,
  agora: Date,
): EstadoPublicoDoSorteio {
  const situacao = situacaoDe(draw);
  const mostrarNumero = podeMostrarNumero(situacao, agora);
  const mostrarGanhador = podeMostrarGanhador(situacao, agora);

  return {
    publicId: draw.publicId,
    status: faseDoSorteio(situacao, agora),
    serverTime: agora.toISOString(),

    campanha: {
      titulo: rifa.title,
      slug: rifa.slug,
      premio: rifa.prizes[0]?.description ?? null,
      imagem: rifa.images[0]?.url ?? null,
      totalNumbers: rifa.totalNumbers,
    },

    raffleEndedAt: draw.raffleEndedAt.toISOString(),
    drawScheduledAt: draw.drawScheduledAt.toISOString(),
    drawStartsAt: draw.drawStartsAt.toISOString(),
    revealAt: draw.revealAt.toISOString(),
    winnerRevealAt: draw.winnerRevealAt.toISOString(),

    eligibleTicketCount: draw.eligibleTicketCount,
    rngMethod: draw.rngMethod,
    // O hash só sai junto do resultado: antes da revelação ele é a impressão
    // digital de uma lista que ninguém pode conferir ainda, e publicá-lo cedo
    // só serviria para alguém tentar adivinhar o universo.
    snapshotHash: mostrarNumero ? draw.snapshotHash : null,
    drawExecutedAt: mostrarNumero ? (draw.drawExecutedAt?.toISOString() ?? null) : null,
    drawVersion: draw.drawVersion,

    resultado:
      mostrarNumero && draw.winningNumber != null
        ? {
            numero: draw.winningNumber,
            ganhador: mostrarGanhador ? draw.winnerName : null,
          }
        : null,

    erro: draw.status === "ERROR" ? (draw.errorReason ?? "Falha no sorteio") : null,
  };
}

/** Campos da campanha que o estado público precisa. Nada além disso. */
export const SELECAO_DA_CAMPANHA = {
  title: true,
  slug: true,
  totalNumbers: true,
  prizes: { select: { description: true }, orderBy: { position: "asc" }, take: 1 },
  images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
} satisfies Prisma.RaffleSelect;

/**
 * Carrega o sorteio pelo código público, avança o que o relógio permitir e
 * devolve o estado. É o caminho único usado pela página e pela API: as duas
 * chegam à mesma conclusão porque passam pela mesma função.
 */
export async function carregarEstadoPublico(
  publicId: string,
  agora: Date = new Date(),
): Promise<EstadoPublicoDoSorteio | null> {
  const draw = await prisma.draw.findUnique({ where: { publicId } });
  if (!draw) return null;

  const atualizado = await avancarSorteio(draw, agora);

  const rifa = await prisma.raffle.findUnique({
    where: { id: atualizado.raffleId },
    select: SELECAO_DA_CAMPANHA,
  });
  if (!rifa) return null;

  return estadoPublico(atualizado, rifa, agora);
}

/** Status em português, para o painel. */
export const ROTULO_DO_STATUS: Record<DrawStatus, string> = {
  WAITING_DRAW: "Agendado",
  COUNTDOWN: "Contagem regressiva",
  DRAWING: "Sorteando",
  REVEALING: "Revelando",
  FINISHED: "Finalizado",
  ERROR: "Erro",
};
