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

import { randomInt } from "node:crypto";

import type { Draw, DrawStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { fullSkinName } from "@/lib/cs2";
import { nomeCurto } from "@/lib/nome-curto";
import type { TimeDeCS2 } from "@/lib/times-cs2";
import { rankFromXp, type Rank } from "@/lib/rank";
import { registrarLog } from "@/server/services/activity-log";
import { handleDrawFinished } from "@/server/services/cronograma";
import { VENDIDO } from "@/server/services/vendidos";
import {
  conferirProva,
  gerarSemente,
  hashDaSemente,
  METODO_VERIFICAVEL,
  sortearComProva,
  type ProvaDoSorteio,
} from "@/lib/sorteio-justo";
import {
  faseDoSorteio,
  idPublicoDoSorteio,
  marcosDoSorteio,
  podeMostrarGanhador,
  podeMostrarNumero,
  temposConfigurados,
  type EstadoDoSorteio,
} from "@/lib/sorteio-ao-vivo";

/**
 * O que conta como título elegível, reexportado.
 *
 * A rota do manifesto precisa da MESMA definição que o motor usou para
 * sortear. Duas listas montadas por regras diferentes fariam a conferência
 * falhar num sorteio honesto, que é o pior defeito possível numa página cujo
 * propósito é dizer "confere".
 */
export const VENDIDO_NO_SORTEIO = VENDIDO;

/**
 * Versão do motor gravada em cada sorteio. Ver `drawVersion` no schema.
 *
 * 1 era o sorteio por `crypto.randomInt`: honesto, imprevisível e impossível
 * de conferir de fora. 2 é o verificável, com compromisso e revelação.
 */
const VERSAO_DO_MOTOR = 2;

/** Escrito por extenso no comprovante. */
const METODO_DE_SORTEIO = METODO_VERIFICAVEL;

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
  bilhetes: {
    id: string;
    number: number;
    userId: string | null;
    nome: string | null;
  }[];
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
 * Esta lista é o MANIFESTO do sorteio: dela sai o hash que entra no cálculo do
 * vencedor, e é ela que a página de conferência publica para o navegador do
 * participante refazer a conta.
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

  return {
    bilhetes: bilhetes.map((b) => ({
      id: b.id,
      number: b.number,
      userId: b.reservation?.userId ?? null,
      nome: b.reservation?.participantName ?? null,
    })),
  };
}

/**
 * Garante que a campanha tenha uma semente comprometida, e devolve o
 * compromisso.
 *
 * Chamada na criação da campanha, que é onde ela vale alguma coisa: o hash
 * fica público enquanto as cotas são vendidas, antes de existir manifesto.
 * Também é chamada antes do sorteio, e aí é rede de proteção para campanha
 * criada antes deste recurso existir. Nesse caso o compromisso nasce depois
 * das vendas, o que é mais fraco, e `committedAt` guarda a data para quem
 * quiser saber a diferença.
 *
 * Idempotente: a semente nunca é trocada depois de comprometida. Trocar seria
 * exatamente a fraude que o compromisso existe para impedir.
 */
export async function garantirSemente(raffleId: string): Promise<string> {
  const existente = await prisma.drawSeed.findUnique({
    where: { raffleId },
    select: { serverSeedHash: true },
  });
  if (existente) return existente.serverSeedHash;

  const serverSeed = gerarSemente();
  const serverSeedHash = await hashDaSemente(serverSeed);
  try {
    await prisma.drawSeed.create({
      data: { raffleId, serverSeed, serverSeedHash },
    });
    return serverSeedHash;
  } catch {
    // Corrida: outro processo comprometeu primeiro. O compromisso que vale é
    // o dele, e nunca o nosso.
    const agora = await prisma.drawSeed.findUniqueOrThrow({
      where: { raffleId },
      select: { serverSeedHash: true },
    });
    return agora.serverSeedHash;
  }
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
    data: {
      status: "DRAWING",
      countdownStartedAt: draw.countdownStartedAt ?? new Date(),
    },
  });
  if (reivindicou.count !== 1) {
    return await prisma.draw.findUniqueOrThrow({ where: { id: draw.id } });
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

    // A semente comprometida. Em campanha nova ela foi travada no dia da
    // criação; a chamada aqui é rede para campanha antiga, e nunca troca uma
    // semente já existente.
    await garantirSemente(draw.raffleId);
    const semente = await prisma.drawSeed.findUniqueOrThrow({
      where: { raffleId: draw.raffleId },
      select: { serverSeed: true, serverSeedHash: true },
    });

    // O sorteio em si: HMAC da semente secreta sobre o hash do manifesto. Não
    // há sorteador aqui dentro, e essa é a diferença que interessa: o
    // resultado é uma CONTA, e qualquer pessoa refaz a mesma conta depois com
    // os dados que publicamos.
    const numeros = universo.bilhetes.map((b) => b.number);
    const prova: ProvaDoSorteio = await sortearComProva(
      numeros,
      semente.serverSeed,
      draw.nonce,
    );

    // Confere a própria conta antes de gravar. Um manifesto com número
    // repetido, ou um bilhete que sumiu entre a leitura e o cálculo, faria a
    // prova nascer torta, e um resultado que não passa na própria conferência
    // é pior do que sorteio nenhum: ele seria publicado como verificável.
    const { ok } = await conferirProva(prova, numeros);
    if (!ok) {
      return await marcarErro(
        draw.id,
        "A prova do sorteio não passou na conferência interna",
      );
    }

    const vencedor = universo.bilhetes.find(
      (b) => b.number === prova.winningNumber,
    );
    if (!vencedor) {
      return await marcarErro(draw.id, "Título sorteado não está no manifesto");
    }

    const executadoEm = new Date();

    const atualizado = await prisma.draw.update({
      where: { id: draw.id },
      data: {
        winningNumber: vencedor.number,
        winnerTicketId: vencedor.id,
        winnerUserId: vencedor.userId,
        winnerName: vencedor.nome ? nomeCurto(vencedor.nome) : null,
        eligibleTicketCount: prova.ticketCount,
        serverSeedHash: prova.serverSeedHash,
        clientSeed: prova.clientSeed,
        winnerIndex: prova.winnerIndex,
        hmacHex: prova.hmacHex,
        rngMethod: METODO_DE_SORTEIO,
        drawVersion: VERSAO_DO_MOTOR,
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
        // winnerNote NÃO é preenchida aqui, e isso é intencional.
        //
        // Ela recebia um parágrafo automático com o código do sorteio, a
        // contagem de títulos, o nome do método e um caminho de URL escrito
        // como texto. Tudo isso já está na página do sorteio, em tabela, com
        // link clicável. Repetido no card de ganhador da campanha virava
        // quatro linhas de jargão embaixo do nome de quem levou a skin, que é
        // o que a pessoa foi ali ver.
        //
        // O campo continua existindo para o que ele sempre foi: um recado
        // escrito à mão pelo admin. Deixá-lo nulo aqui é o que devolve esse
        // espaço a quem tem algo a dizer.
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
        elegiveis: prova.ticketCount,
        metodo: METODO_DE_SORTEIO,
        indice: prova.winnerIndex,
        manifesto: prova.clientSeed,
        // Só quando divergiu do que foi contado no encerramento. Divergir é
        // possível de forma legítima (um webhook atrasado confirmando um
        // pagamento depois do fechamento), e é exatamente o tipo de coisa que
        // ninguém consegue reconstruir depois sem registro.
        ...(draw.eligibleTicketCount !== prova.ticketCount
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

    // O CICLO ACABOU: é daqui que o cronograma puxa a próxima campanha.
    //
    // Este é o único ponto do sistema em que "o sorteio terminou" acontece uma
    // vez só, porque a guarda de status acima já garantiu isso. Pendurar a
    // fila em qualquer outro lugar (o esgotamento das cotas, o encerramento da
    // campanha) publicaria a próxima antes de esta revelar o ganhador.
    //
    // Ele não pode derrubar a finalização: o cronograma engole os próprios
    // erros, e se mesmo assim algo escapar, o catch aqui garante que o sorteio
    // termina de qualquer jeito. A varredura do cron recupera a fila depois.
    await handleDrawFinished(draw.raffleId).catch((err) =>
      console.error("[sorteio-ao-vivo] cronograma:", err),
    );
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
    /** A foto da skin. É o objeto do desejo desta tela. */
    premioImagem: string | null;
    imagem: string | null;
    /** Troféu ao lado de "Número sorteado". Null: a tela não desenha nada. */
    trofeu: string | null;
    totalNumbers: number;
  };

  raffleEndedAt: string;
  drawScheduledAt: string;
  drawStartsAt: string;
  revealAt: string;
  winnerRevealAt: string;

  eligibleTicketCount: number;
  rngMethod: string;
  drawExecutedAt: string | null;

  /**
   * Uma amostra dos títulos que disputaram, para o carretel da animação ter
   * números de verdade correndo na fita em vez de dígitos inventados.
   *
   * É enfeite, e não vaza nada: são títulos vendidos, sorteados sem relação
   * nenhuma com o resultado, e a lista inteira vira pública no manifesto
   * depois da revelação de qualquer jeito.
   */
  amostraDeTitulos: number[];
  drawVersion: number;

  /**
   * A prova do sorteio.
   *
   * `serverSeedHash` é o COMPROMISSO e sai desde o primeiro instante: ele foi
   * publicado antes da primeira venda, e escondê-lo agora tiraria o sentido de
   * tê-lo publicado. `serverSeed` é a chave secreta e só sai depois que o
   * número é público; antes disso ela permitiria calcular o resultado antes da
   * hora, que é a única coisa que este desenho precisa impedir.
   */
  prova: {
    serverSeedHash: string | null;
    serverSeed: string | null;
    clientSeed: string | null;
    nonce: number;
    winnerIndex: number | null;
    hmacHex: string | null;
  };

  /**
   * O resultado. Null enquanto não pode ser mostrado, e null é literal: a
   * chave nem sai com o número dentro esperando o cliente se comportar.
   */
  resultado: {
    numero: number;
    /** Só a partir de `winnerRevealAt`. Antes disso vem null. */
    ganhador: string | null;
    /**
     * O time para quem o ganhador torce, ao lado do nome dele.
     *
     * Sai junto com o nome e pela mesma chave: antes da revelação, nome e time
     * seriam duas pistas de quem ganhou, e o time estreita muito o palpite.
     */
    time: TimeDeCS2 | null;
    /**
     * O rank do ganhador, para o selo aparecer à esquerda do nome.
     *
     * Vai RESOLVIDO do servidor, e com o `xp` zerado de propósito: o selo só
     * precisa de nível, patente e cor, e XP é dado da conta de alguém. Sai
     * pela mesma chave do nome, então antes da revelação não existe.
     *
     * Nulo também quando o rank está desligado no tenant, ou quando a compra
     * foi feita sem conta: nos dois casos não há patente para mostrar.
     */
    rank: Rank | null;
  } | null;

  erro: string | null;
}

interface RifaDoSorteio {
  title: string;
  slug: string;
  totalNumbers: number;
  prizes: { description: string; imageUrl: string | null }[];
  images: { url: string }[];
  trofeuUrl: string | null;
  tenant: { trofeuUrl: string | null };
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
  semente?: { serverSeed: string; serverSeedHash: string } | null,
  amostraDeTitulos: number[] = [],
  /** Já resolvido por quem carregou: esta função é pura sobre o que recebe. */
  timeDoGanhador: TimeDeCS2 | null = null,
  rankDoGanhador: Rank | null = null,
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
      // A foto da skin, a mesma que a página da campanha usa em "ver os
      // prêmios". A capa é arte de divulgação, com nome e logo dentro; a foto
      // é o item. Numa tela que fala do prêmio, é o item que tem que aparecer.
      premioImagem: rifa.prizes[0]?.imageUrl ?? null,
      imagem: rifa.images[0]?.url ?? null,
      // A campanha ganha do site quando ela tem o seu; sem nenhum dos dois,
      // a tela não desenha nada.
      trofeu: rifa.trofeuUrl ?? rifa.tenant.trofeuUrl,
      totalNumbers: rifa.totalNumbers,
    },

    raffleEndedAt: draw.raffleEndedAt.toISOString(),
    drawScheduledAt: draw.drawScheduledAt.toISOString(),
    drawStartsAt: draw.drawStartsAt.toISOString(),
    revealAt: draw.revealAt.toISOString(),
    winnerRevealAt: draw.winnerRevealAt.toISOString(),

    eligibleTicketCount: draw.eligibleTicketCount,
    rngMethod: draw.rngMethod,
    amostraDeTitulos,
    drawExecutedAt: mostrarNumero
      ? (draw.drawExecutedAt?.toISOString() ?? null)
      : null,
    drawVersion: draw.drawVersion,

    prova: {
      // O compromisso é público desde sempre, e é o que dá valor a ele.
      serverSeedHash: draw.serverSeedHash ?? semente?.serverSeedHash ?? null,
      // A chave secreta, só depois do número. Esta linha é a única guarda que
      // separa "verificável" de "previsível".
      serverSeed: mostrarNumero ? (semente?.serverSeed ?? null) : null,
      // O resto da prova sai junto com o número: antes dele, o hash do
      // manifesto e o HMAC seriam pistas sobre um resultado que ainda não pode
      // aparecer.
      clientSeed: mostrarNumero ? draw.clientSeed : null,
      nonce: draw.nonce,
      winnerIndex: mostrarNumero ? draw.winnerIndex : null,
      hmacHex: mostrarNumero ? draw.hmacHex : null,
    },

    resultado:
      mostrarNumero && draw.winningNumber != null
        ? {
            numero: draw.winningNumber,
            ganhador: mostrarGanhador ? draw.winnerName : null,
            time: mostrarGanhador ? timeDoGanhador : null,
            rank: mostrarGanhador ? rankDoGanhador : null,
          }
        : null,

    erro:
      draw.status === "ERROR" ? (draw.errorReason ?? "Falha no sorteio") : null,
  };
}

/** Campos da campanha que o estado público precisa. Nada além disso. */
export const SELECAO_DA_CAMPANHA = {
  title: true,
  slug: true,
  totalNumbers: true,
  prizes: {
    select: { description: true, imageUrl: true },
    orderBy: { position: "asc" },
    take: 1,
  },
  images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
  trofeuUrl: true,
  // O troféu do site vem junto, na mesma consulta: ele é o padrão de toda
  // campanha, e buscá-lo à parte seria uma ida ao banco por espectador para
  // ler uma coluna que já está a um join de distância.
  tenant: { select: { trofeuUrl: true } },
} satisfies Prisma.RaffleSelect;

/**
 * Amostra em memória, por sorteio.
 *
 * A fita do carretel não muda: o universo está congelado desde o
 * encerramento. Guardar a amostra na instância evita repetir a consulta a cada
 * consulta de estado, e no segundo em que a contagem zera são todos os
 * espectadores perguntando de uma vez.
 */
const amostraPorSorteio = new Map<string, number[]>();

/**
 * Quarenta títulos espalhados pela lista INTEIRA, para a fita do carretel.
 *
 * Já foram os quarenta primeiros, e depois quatro faixas em 0%, 25%, 50% e
 * 75%. As duas versões erravam pelo mesmo motivo: a fita mostrava sempre os
 * mesmos punhados de números. Com as faixas, uma campanha de mil títulos
 * exibia 0004, 0253, 0505 e 0755 girando em todo sorteio, e quem assiste não
 * sabe que a fita é enfeite. Ver sempre os mesmos números altos passando, e o
 * resultado caindo lá em cima, é o bastante para a pessoa concluir que o
 * sorteio puxa para o fim da lista. Foi exatamente essa a reclamação.
 *
 * Agora é um passo constante ao longo do bolo todo: com mil títulos, pega um
 * a cada vinte e cinco, do primeiro ao último. A fita passa a percorrer a
 * faixa inteira, que é o que ela deveria sugerir desde o começo.
 *
 * Uma consulta só, com `row_number()`, e guardada em memória por sorteio: no
 * segundo em que a contagem zera são todos os espectadores perguntando de uma
 * vez, e isto não podia ser por requisição.
 */
async function amostraParaOCarretel(draw: Draw): Promise<number[]> {
  // Antes só na contagem e no sorteio. Agora também depois: quem reabre um
  // sorteio encerrado vê a fita frear até o vencedor, e ela precisa correr
  // com títulos que disputaram de verdade, não com números do intervalo.
  if (draw.status === "WAITING_DRAW") return [];
  const guardada = amostraPorSorteio.get(draw.id);
  if (guardada) return guardada;

  const linhas = await prisma.$queryRaw<{ number: number }[]>`
    SELECT "number" FROM (
      SELECT "number",
             row_number() OVER (ORDER BY "number") - 1 AS pos,
             count(*) OVER () AS total
      FROM "Ticket"
      WHERE "raffleId" = ${draw.raffleId}
        AND "status" IN ('PAID', 'AWARDED')
    ) t
    WHERE pos % GREATEST(1, (total / 40)::int) = 0
    ORDER BY "number"
    LIMIT 40
  `;

  const amostra = linhas.map((l) => Number(l.number));
  amostraPorSorteio.set(draw.id, amostra);
  return amostra;
}

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

  const [rifa, semente, amostra] = await Promise.all([
    prisma.raffle.findUnique({
      where: { id: atualizado.raffleId },
      select: SELECAO_DA_CAMPANHA,
    }),
    prisma.drawSeed.findUnique({
      where: { raffleId: atualizado.raffleId },
      select: { serverSeed: true, serverSeedHash: true },
    }),
    amostraParaOCarretel(atualizado),
  ]);
  if (!rifa) return null;

  // A semente entra inteira aqui e `estadoPublico` decide o que sai. A decisão
  // fica num lugar só, e não repartida entre quem busca e quem monta.
  // O time de quem ganhou, para o emblema aparecer ao lado do nome na
  // revelação. Só é buscado quando existe conta ligada: compra feita sem login
  // não tem time, e aí a consulta seria em vão.
  const [timeDoGanhador, rankDoGanhador] = atualizado.winnerUserId
    ? await Promise.all([
        timeDoUsuario(atualizado.winnerUserId),
        rankDoUsuario(atualizado.winnerUserId, atualizado.raffleId),
      ])
    : [null, null];

  return estadoPublico(
    atualizado,
    rifa,
    agora,
    semente,
    amostra,
    timeDoGanhador,
    rankDoGanhador,
  );
}

/**
 * O rank de uma conta, pronto para o selo.
 *
 * Lê a MESMA fonte que a página "Minha conta" e o ranking usam, `UserProgress`,
 * e chama a MESMA função, `rankFromXp`: o selo do ganhador não pode discordar
 * do selo que a própria pessoa vê na conta dela. `totalSpent` entra porque o
 * GOAT é a única patente que também exige gasto, e sem ele o topo apareceria
 * como PRO.
 *
 * O que volta tem `xp` zerado. O selo precisa de nível, patente e cor; XP e
 * gasto são dados da conta de alguém e não têm por que atravessar a rede numa
 * página que o site inteiro assiste.
 *
 * Nulo quando o rank está desligado no tenant, ou quando não há progresso
 * gravado: quem não tem linha ainda cai no nível inicial, e mostrar o selo
 * zero para uma conta sem histórico não diz nada.
 */
async function rankDoUsuario(
  userId: string,
  raffleId: string,
): Promise<Rank | null> {
  const rifa = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { tenantId: true, tenant: { select: { rankEnabled: true } } },
  });
  if (!rifa?.tenant.rankEnabled) return null;

  const progresso = await prisma.userProgress.findUnique({
    where: { userId_tenantId: { userId, tenantId: rifa.tenantId } },
    select: { xp: true, totalSpent: true },
  });
  if (!progresso) return null;

  const rank = rankFromXp(progresso.xp, Number(progresso.totalSpent));
  return { ...rank, xp: 0 };
}

/**
 * O time para quem uma conta torce, pronto para a tela.
 *
 * Duas idas ao banco em vez de um join porque Team não tem relação declarada
 * com User: o campo guarda o id como texto, justamente para um time que saia
 * da lista não arrastar a conta de ninguém junto.
 */
async function timeDoUsuario(userId: string): Promise<TimeDeCS2 | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { favoriteTeamId: true },
  });
  if (!u?.favoriteTeamId) return null;
  const t = await prisma.team.findUnique({ where: { id: u.favoriteTeamId } });
  if (!t) return null;
  return {
    id: t.id,
    nome: t.nome,
    tag: t.tag,
    cor: t.cor,
    regiao: t.regiao === "BR" ? "BR" : "INTER",
    escudo: t.escudo,
  };
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

/**
 * O que o ganhador precisa para reivindicar o prêmio na página do sorteio.
 *
 * Devolve nulo em qualquer caso que não seja "quem está olhando ganhou e há
 * para onde mandar essa pessoa". São quatro portas, e todas fecham em silêncio:
 * visitante deslogado, sorteio ainda não concluído, conta diferente da do
 * ganhador, e site sem telefone de suporte cadastrado.
 *
 * A comparação é por CONTA, e não por nome: existem dois "João Silva", e isto
 * abre uma conversa de entrega de skin. Compra feita sem login não tem conta
 * ligada, e nesse caso ninguém vê o botão, nem quem ganhou; é o preço de não
 * arriscar mostrar a reivindicação para a pessoa errada.
 *
 * Roda no servidor e o resultado nunca entra no endpoint público de estado: se
 * entrasse, uma resposta guardada em cache entregaria o link de um ganhador
 * para outra pessoa.
 */
export interface DadosDeReivindicacao {
  telefoneDoSuporte: string;
  nome: string;
  premio: string;
  /** Link de troca da Steam. Nulo quando a pessoa ainda não cadastrou. */
  tradeUrl: string | null;
  titulo: number;
  totalNumbers: number;
}

export async function dadosDeReivindicacao(
  publicId: string,
  userId: string | null | undefined,
): Promise<DadosDeReivindicacao | null> {
  if (!userId) return null;

  const draw = await prisma.draw.findUnique({
    where: { publicId },
    select: {
      status: true,
      winningNumber: true,
      raffle: {
        select: {
          id: true,
          title: true,
          totalNumbers: true,
          tenantId: true,
          // A ficha da skin junto, e não só a descrição: a mensagem que o
          // ganhador manda para o suporte precisa dizer QUAL item é, e uma
          // skin sem desgaste é cinco itens de preços diferentes. O
          // atendimento começava perguntando isso.
          prizes: {
            select: {
              description: true,
              skinName: true,
              skinWear: true,
              skinStatTrak: true,
              skinSouvenir: true,
            },
            take: 1,
          },
        },
      },
    },
  });
  if (!draw || draw.status !== "FINISHED" || draw.winningNumber == null) {
    return null;
  }

  const bilhete = await prisma.ticket.findFirst({
    where: {
      raffleId: draw.raffle.id,
      number: draw.winningNumber,
      status: { in: ["PAID", "AWARDED"] },
    },
    select: {
      reservation: {
        select: {
          userId: true,
          participantName: true,
          // O link de troca vem junto: é para onde a skin sai, e é a única
          // coisa que o suporte não consegue descobrir sozinho.
          user: { select: { steamTradeUrl: true } },
        },
      },
    },
  });
  if (!bilhete?.reservation || bilhete.reservation.userId !== userId) {
    return null;
  }

  const tenant = draw.raffle.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: draw.raffle.tenantId },
        select: { supportPhone: true },
      })
    : null;
  if (!tenant?.supportPhone) return null;

  return {
    telefoneDoSuporte: tenant.supportPhone,
    nome: bilhete.reservation.participantName,
    // A DESCRIÇÃO MANDA, e o desgaste entra por cima quando falta.
    //
    // `skinName` é o nome de catálogo e às vezes diz menos: nesta base o
    // prêmio tem skinName "★ Butterfly Knife | Doppler" e descrição
    // "★ Butterfly Knife | Doppler Ruby (Nova de Fábrica)". Compor a partir
    // do nome de catálogo perderia o "Ruby", e é justamente a fase que decide
    // o preço do item. Passando skinName nulo, fullSkinName usa a descrição
    // como base e só acrescenta o desgaste se ele ainda não estiver escrito.
    premio: draw.raffle.prizes[0]
      ? fullSkinName({ ...draw.raffle.prizes[0], skinName: null })
      : draw.raffle.title,
    tradeUrl: bilhete.reservation.user?.steamTradeUrl ?? null,
    titulo: draw.winningNumber,
    totalNumbers: draw.raffle.totalNumbers,
  };
}
