// O CRONOGRAMA DE SORTEIOS: a fila que troca a campanha do ar sozinha.
//
// Este arquivo é a única casa da regra. Nenhuma tela, nenhuma action e nenhum
// cron decide quem entra: todos passam por aqui. Espalhar isso por controllers
// é como o recurso morre, porque a segunda cópia da regra nasce no dia em que
// alguém precisa de um caso especial.
//
// O QUE ELE NÃO FAZ
//
// Não vende, não cobra, não sorteia, não escolhe ganhador e não encerra
// campanha. Tudo isso continua no motor que já existe. O cronograma responde
// UMA pergunta: qual campanha vai ao ar depois desta.
//
// O GATILHO É O FIM DE VERDADE
//
// Campanha vira FINISHED no instante em que ESGOTA, não quando o sorteio
// acontece: é assim que o motor congela o universo antes da transmissão. Usar
// isso como gatilho publicaria a próxima campanha dez minutos antes de a
// anterior revelar o ganhador, com as duas no ar ao mesmo tempo. Por isso o
// gancho fica no único ponto em que o ciclo termina de verdade: a transição do
// Draw para FINISHED, que o motor faz uma vez só, com guarda de status.
//
// AS TRÊS TRAVAS
//
// 1. ÍNDICE PARCIAL ÚNICO. Um item ATIVO por fila, cobrado pelo Postgres. É a
//    garantia que sobrevive a qualquer erro de raciocínio deste arquivo.
//
// 2. SELECT ... FOR UPDATE na linha da fila. Duas ativações simultâneas viram
//    uma fila indiana: a segunda só olha a fila depois que a primeira gravou,
//    e aí ela vê o item ativo e desiste. Sem a trava, as duas leriam "não tem
//    ninguém ativo" no mesmo instante e as duas seguiriam.
//
// 3. GUARDA DE STATUS em toda escrita. Nenhuma transição é "ler, decidir,
//    escrever": é UPDATE com o estado anterior no WHERE, e quem leva o
//    `count: 1` é quem faz o trabalho. É o que torna tudo idempotente, do
//    webhook reentregue ao clique duplo.

import { Prisma } from "@prisma/client";
import type { DrawSchedule, DrawScheduleItem, Raffle } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  liberadoEm,
  proximoDaFila,
  validarParaFila,
  type CampanhaParaFila,
  type ResultadoDaValidacao,
} from "@/lib/cronograma";
import { registrarLog } from "@/server/services/activity-log";

/** Quem mandou ativar. Fica gravado no item e no histórico. */
export type OrigemDaAtivacao = "AUTOMATICO" | "MANUAL";

export type FalhaDaAtivacao =
  | "SEM_FILA"
  | "AUTOMACAO_PAUSADA"
  | "JA_TEM_ATIVO"
  | "FILA_VAZIA"
  | "ITEM_FORA_DA_FILA"
  | "CAMPANHA_MUDOU"
  | "CORRIDA"
  | "ERRO";

export type ResultadoDaAtivacao =
  | { ok: true; raffleId: string; titulo: string; itemId: string }
  | { ok: false; motivo: FalhaDaAtivacao; detalhe?: string };

// ---------------------------------------------------------------------------
// A FILA
// ---------------------------------------------------------------------------

/**
 * A fila do painel, criada na primeira vez que alguém precisa dela.
 *
 * `upsert` e não "busca, se não achar cria": duas abas abrindo o cronograma no
 * mesmo segundo criariam duas filas, e a chave única do tenant transformaria
 * isso num erro na cara do admin. Assim a corrida é resolvida pelo banco.
 */
export async function garantirCronograma(
  tenantId: string,
): Promise<DrawSchedule> {
  return prisma.drawSchedule.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {},
  });
}

export interface ItemComCampanha extends DrawScheduleItem {
  raffle: Pick<
    Raffle,
    "id" | "title" | "slug" | "status" | "totalNumbers" | "pricePerNumber"
  > & { capa: string | null };
}

/** A fila inteira, com o que a tela precisa mostrar de cada campanha. */
export async function carregarCronograma(tenantId: string): Promise<{
  cronograma: DrawSchedule;
  itens: ItemComCampanha[];
}> {
  const cronograma = await garantirCronograma(tenantId);
  const brutos = await prisma.drawScheduleItem.findMany({
    where: { scheduleId: cronograma.id },
    orderBy: [{ posicao: "asc" }, { id: "asc" }],
    include: {
      raffle: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          totalNumbers: true,
          pricePerNumber: true,
          images: {
            where: { isCover: true },
            take: 1,
            select: { url: true },
          },
        },
      },
    },
  });

  const itens: ItemComCampanha[] = brutos.map(({ raffle, ...item }) => ({
    ...item,
    raffle: {
      id: raffle.id,
      title: raffle.title,
      slug: raffle.slug,
      status: raffle.status,
      totalNumbers: raffle.totalNumbers,
      pricePerNumber: raffle.pricePerNumber,
      capa: raffle.images[0]?.url ?? null,
    },
  }));

  return { cronograma, itens };
}

/** A validação de prontidão, com os dados vindos do banco. */
export async function validarCampanhaParaFila(
  raffleId: string,
  tenantId: string,
): Promise<ResultadoDaValidacao & { titulo: string | null }> {
  const raffle = await prisma.raffle.findFirst({
    where: { id: raffleId, tenantId },
    select: {
      title: true,
      status: true,
      totalNumbers: true,
      pricePerNumber: true,
      isFree: true,
      privacy: true,
      _count: { select: { prizes: true, images: true } },
      images: { where: { isCover: true }, take: 1, select: { id: true } },
    },
  });
  if (!raffle) {
    return { erros: ["Campanha não encontrada."], avisos: [], titulo: null };
  }

  const entrada: CampanhaParaFila = {
    status: raffle.status,
    title: raffle.title,
    totalNumbers: raffle.totalNumbers,
    pricePerNumber: Number(raffle.pricePerNumber),
    isFree: raffle.isFree,
    premios: raffle._count.prizes,
    temCapa: raffle.images.length > 0,
    privacy: raffle.privacy,
  };
  return { ...validarParaFila(entrada), titulo: raffle.title };
}

/**
 * Coloca uma campanha no fim da fila.
 *
 * A campanha sai de DRAFT e vira QUEUED, e é isso que a esconde do site: nem a
 * vitrine nem a página do slug aceitam QUEUED. O item entra AGUARDANDO, na
 * última posição.
 *
 * Recolocar uma campanha que já esteve na fila reaproveita a linha, e por isso
 * o histórico dela (quando foi ativada, quando foi pulada) fica num lugar só.
 */
export async function enfileirar(input: {
  tenantId: string;
  raffleId: string;
  /** O dia a que o item pertence no painel. Só rótulo. */
  dia?: Date | null;
  adminId?: string | null;
}): Promise<{ ok: true; itemId: string } | { ok: false; erros: string[] }> {
  const validacao = await validarCampanhaParaFila(input.raffleId, input.tenantId);
  if (validacao.erros.length > 0) return { ok: false, erros: validacao.erros };

  const cronograma = await garantirCronograma(input.tenantId);

  const item = await prisma.$transaction(async (tx) => {
    const ultima = await tx.drawScheduleItem.aggregate({
      where: { scheduleId: cronograma.id },
      _max: { posicao: true },
    });
    const posicao = (ultima._max.posicao ?? -1) + 1;

    // A campanha só entra na fila se ainda estiver parada. QUEUED também
    // passa: é o caso de mexer no dia de um item que já espera.
    const marcou = await tx.raffle.updateMany({
      where: {
        id: input.raffleId,
        tenantId: input.tenantId,
        status: { in: ["DRAFT", "QUEUED"] },
      },
      data: { status: "QUEUED" },
    });
    if (marcou.count !== 1) return null;

    return tx.drawScheduleItem.upsert({
      where: { raffleId: input.raffleId },
      create: {
        scheduleId: cronograma.id,
        raffleId: input.raffleId,
        posicao,
        dia: input.dia ?? null,
        criadoPorId: input.adminId ?? null,
      },
      update: {
        scheduleId: cronograma.id,
        status: "AGUARDANDO",
        posicao,
        dia: input.dia ?? null,
        puladoEm: null,
        removidoEm: null,
        erro: null,
      },
    });
  });

  if (!item) {
    return { ok: false, erros: ["A campanha mudou de situação. Recarregue."] };
  }

  await registrarLog({
    acao: "cronograma.enfileirado",
    tenantId: input.tenantId,
    alvo: { tipo: "Raffle", id: input.raffleId, rotulo: validacao.titulo ?? undefined },
    detalhes: { posicao: item.posicao },
  });

  return { ok: true, itemId: item.id };
}

/**
 * Adota uma campanha que JÁ ESTÁ no ar como o item ativo da fila.
 *
 * Existe para o primeiro dia. Sem isto, a fila só começaria a valer depois que
 * a campanha do momento terminasse por fora dela, e o admin teria de esperar um
 * ciclo inteiro para o cronograma virar realidade.
 */
export async function adotarComoAtivo(input: {
  tenantId: string;
  raffleId: string;
  adminId?: string | null;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const cronograma = await garantirCronograma(input.tenantId);
  const raffle = await prisma.raffle.findFirst({
    where: { id: input.raffleId, tenantId: input.tenantId },
    select: { id: true, title: true, status: true },
  });
  if (!raffle) return { ok: false, erro: "Campanha não encontrada." };
  if (raffle.status !== "ACTIVE") {
    return { ok: false, erro: "Só campanha no ar pode ser adotada." };
  }

  try {
    const feito = await prisma.$transaction(async (tx) => {
      await travarFila(tx, cronograma.id);
      const jaAtivo = await tx.drawScheduleItem.findFirst({
        where: { scheduleId: cronograma.id, status: "ATIVO" },
        select: { id: true, raffleId: true },
      });
      if (jaAtivo) return jaAtivo.raffleId === input.raffleId;

      const ultima = await tx.drawScheduleItem.aggregate({
        where: { scheduleId: cronograma.id },
        _max: { posicao: true },
      });
      await tx.drawScheduleItem.upsert({
        where: { raffleId: input.raffleId },
        create: {
          scheduleId: cronograma.id,
          raffleId: input.raffleId,
          status: "ATIVO",
          posicao: (ultima._max.posicao ?? -1) + 1,
          ativadoEm: new Date(),
          ativadoPor: "MANUAL",
          criadoPorId: input.adminId ?? null,
        },
        update: {
          scheduleId: cronograma.id,
          status: "ATIVO",
          ativadoEm: new Date(),
          ativadoPor: "MANUAL",
          erro: null,
        },
      });
      return true;
    });
    if (!feito) {
      return { ok: false, erro: "Já existe outra campanha ativa na fila." };
    }
  } catch (err) {
    if (violouChaveUnica(err)) {
      return { ok: false, erro: "Já existe outra campanha ativa na fila." };
    }
    throw err;
  }

  await registrarLog({
    acao: "cronograma.ativado_manual",
    tenantId: input.tenantId,
    alvo: { tipo: "Raffle", id: raffle.id, rotulo: raffle.title },
    detalhes: { adotada: true },
  });
  return { ok: true };
}

/** Tira da fila sem apagar nada: a campanha volta a ser rascunho. */
export async function removerDaFila(input: {
  tenantId: string;
  itemId: string;
}): Promise<{ ok: boolean; erro?: string }> {
  const item = await itemDoTenant(input.itemId, input.tenantId);
  if (!item) return { ok: false, erro: "Item não encontrado." };
  if (item.status === "ATIVO") {
    return {
      ok: false,
      erro: "A campanha está no ar. Encerre por Sorteios antes de tirar da fila.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.drawScheduleItem.updateMany({
      where: { id: item.id, status: { in: ["AGUARDANDO", "PULADO", "FALHOU"] } },
      data: { status: "REMOVIDO", removidoEm: new Date(), erro: null },
    });
    // Volta a ser rascunho, e não apagada: o trabalho de preparar a campanha
    // continua valendo, e ela pode voltar para a fila com um clique.
    await tx.raffle.updateMany({
      where: { id: item.raffleId, status: "QUEUED" },
      data: { status: "DRAFT" },
    });
  });

  await registrarLog({
    acao: "cronograma.removido",
    tenantId: input.tenantId,
    alvo: { tipo: "Raffle", id: item.raffleId, rotulo: item.raffle.title },
  });
  return { ok: true };
}

/** Pula neste ciclo. A campanha continua preparada e pode voltar depois. */
export async function pularItem(input: {
  tenantId: string;
  itemId: string;
}): Promise<{ ok: boolean; erro?: string }> {
  const item = await itemDoTenant(input.itemId, input.tenantId);
  if (!item) return { ok: false, erro: "Item não encontrado." };

  const mudou = await prisma.drawScheduleItem.updateMany({
    where: { id: item.id, status: "AGUARDANDO" },
    data: { status: "PULADO", puladoEm: new Date() },
  });
  if (mudou.count !== 1) {
    return { ok: false, erro: "Só dá para pular quem está aguardando." };
  }

  await registrarLog({
    acao: "cronograma.pulado",
    tenantId: input.tenantId,
    alvo: { tipo: "Raffle", id: item.raffleId, rotulo: item.raffle.title },
  });
  return { ok: true };
}

/** Devolve para a fila quem foi pulado ou removido. */
export async function devolverParaFila(input: {
  tenantId: string;
  itemId: string;
}): Promise<{ ok: boolean; erro?: string }> {
  const item = await itemDoTenant(input.itemId, input.tenantId);
  if (!item) return { ok: false, erro: "Item não encontrado." };

  const resultado = await enfileirar({
    tenantId: input.tenantId,
    raffleId: item.raffleId,
    dia: item.dia,
  });
  if (!resultado.ok) return { ok: false, erro: resultado.erros[0] };
  return { ok: true };
}

/**
 * Grava a ordem que a tela produziu.
 *
 * Recebe a lista inteira dos que aguardam, na ordem nova, e renumera de zero.
 * Renumerar tudo em vez de trocar dois valores é o que mantém a fila
 * previsível depois de uma sequência de arrastos.
 */
export async function reordenarFila(input: {
  tenantId: string;
  idsNaOrdem: string[];
}): Promise<{ ok: boolean; erro?: string }> {
  const cronograma = await garantirCronograma(input.tenantId);
  const itens = await prisma.drawScheduleItem.findMany({
    where: { scheduleId: cronograma.id, status: "AGUARDANDO" },
    select: { id: true },
  });
  const conhecidos = new Set(itens.map((i) => i.id));
  const ordem = input.idsNaOrdem.filter((id) => conhecidos.has(id));
  if (ordem.length !== conhecidos.size) {
    // A lista da tela está velha: alguém pulou, removeu ou ativou um item
    // enquanto ela estava aberta. Gravar assim mesmo deixaria a fila numa
    // ordem que ninguém pediu.
    return { ok: false, erro: "A fila mudou. Recarregue a página." };
  }

  await prisma.$transaction(
    ordem.map((id, i) =>
      prisma.drawScheduleItem.update({ where: { id }, data: { posicao: i } }),
    ),
  );

  await registrarLog({
    acao: "cronograma.reordenado",
    tenantId: input.tenantId,
    detalhes: { itens: ordem.length },
  });
  return { ok: true };
}

/** Liga e desliga a troca automática. Não mexe em quem já está no ar. */
export async function definirAutomacao(input: {
  tenantId: string;
  ativa: boolean;
}): Promise<DrawSchedule> {
  const cronograma = await garantirCronograma(input.tenantId);
  const atualizado = await prisma.drawSchedule.update({
    where: { id: cronograma.id },
    data: { automacaoAtiva: input.ativa },
  });
  await registrarLog({
    acao: input.ativa ? "cronograma.retomado" : "cronograma.pausado",
    tenantId: input.tenantId,
  });
  return atualizado;
}

/** O intervalo entre o fim de um sorteio e a entrada do próximo. */
export async function definirAtraso(input: {
  tenantId: string;
  segundos: number;
}): Promise<DrawSchedule> {
  const cronograma = await garantirCronograma(input.tenantId);
  const segundos = Math.min(3600, Math.max(0, Math.round(input.segundos)));
  const atualizado = await prisma.drawSchedule.update({
    where: { id: cronograma.id },
    data: { atrasoEmSegundos: segundos },
  });
  await registrarLog({
    acao: "cronograma.atraso_alterado",
    tenantId: input.tenantId,
    detalhes: { segundos },
  });
  return atualizado;
}

// ---------------------------------------------------------------------------
// A ATIVAÇÃO
// ---------------------------------------------------------------------------

/**
 * A trava da fila.
 *
 * `FOR UPDATE` na linha do cronograma. Quem chega depois espera aqui, e quando
 * passa já enxerga o que a primeira transação gravou. É o que transforma duas
 * ativações simultâneas numa fila indiana em vez de duas campanhas no ar.
 */
async function travarFila(
  tx: Prisma.TransactionClient,
  scheduleId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "DrawSchedule" WHERE id = ${scheduleId} FOR UPDATE`;
}

function violouChaveUnica(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/**
 * Ativa um item específico, ou o próximo da fila quando `itemId` não vem.
 *
 * Tudo numa transação: ou a campanha vai ao ar E o item vira ATIVO, ou nada
 * acontece. Um estado parcial aqui seria campanha publicada sem dono na fila,
 * que é o defeito mais caro possível: ninguém saberia quem ativar depois.
 */
export async function ativarProximo(input: {
  tenantId: string;
  origem: OrigemDaAtivacao;
  /** Quando vem, ativa este item. Sem ele, o primeiro que aguarda. */
  itemId?: string;
  /** Só para o caminho automático: respeita a pausa. */
  respeitarPausa?: boolean;
}): Promise<ResultadoDaAtivacao> {
  const cronograma = await garantirCronograma(input.tenantId);
  if (input.respeitarPausa && !cronograma.automacaoAtiva) {
    return { ok: false, motivo: "AUTOMACAO_PAUSADA" };
  }

  try {
    const resultado = await prisma.$transaction(
      async (tx): Promise<ResultadoDaAtivacao> => {
        await travarFila(tx, cronograma.id);

        const jaAtivo = await tx.drawScheduleItem.findFirst({
          where: { scheduleId: cronograma.id, status: "ATIVO" },
          select: { id: true },
        });
        if (jaAtivo) return { ok: false, motivo: "JA_TEM_ATIVO" };

        const emEspera = await tx.drawScheduleItem.findMany({
          where: { scheduleId: cronograma.id, status: "AGUARDANDO" },
          select: { id: true, raffleId: true, status: true, posicao: true },
        });
        const alvo = input.itemId
          ? (emEspera.find((i) => i.id === input.itemId) ?? null)
          : proximoDaFila(emEspera);
        if (!alvo) {
          return {
            ok: false,
            motivo: input.itemId ? "ITEM_FORA_DA_FILA" : "FILA_VAZIA",
          };
        }

        const campanha = await tx.raffle.findFirst({
          where: { id: alvo.raffleId, tenantId: input.tenantId },
          select: { id: true, title: true, status: true },
        });
        if (!campanha) return { ok: false, motivo: "CAMPANHA_MUDOU" };

        // A campanha só sobe se ainda estiver QUEUED. É a guarda que impede
        // republicar uma campanha que o admin tirou da fila pela outra tela
        // entre a leitura e a escrita.
        const publicou = await tx.raffle.updateMany({
          where: { id: alvo.raffleId, status: "QUEUED" },
          data: { status: "ACTIVE" },
        });
        if (publicou.count !== 1) {
          return {
            ok: false,
            motivo: "CAMPANHA_MUDOU",
            detalhe: `A campanha "${campanha.title}" não estava mais na fila.`,
          };
        }

        const virou = await tx.drawScheduleItem.updateMany({
          where: { id: alvo.id, status: "AGUARDANDO" },
          data: {
            status: "ATIVO",
            ativadoEm: new Date(),
            ativadoPor: input.origem,
            erro: null,
          },
        });
        if (virou.count !== 1) return { ok: false, motivo: "CORRIDA" };

        return {
          ok: true,
          raffleId: campanha.id,
          titulo: campanha.title,
          itemId: alvo.id,
        };
      },
    );

    if (resultado.ok) {
      await prisma.drawSchedule.update({
        where: { id: cronograma.id },
        data: { ultimoErro: null, ultimoErroEm: null },
      });
      await registrarLog({
        acao:
          input.origem === "AUTOMATICO"
            ? "cronograma.ativado_auto"
            : "cronograma.ativado_manual",
        tenantId: input.tenantId,
        origem: input.origem === "AUTOMATICO" ? "SISTEMA" : "PAINEL",
        ...(input.origem === "AUTOMATICO"
          ? { ator: { nome: "Cronograma" } }
          : {}),
        alvo: { tipo: "Raffle", id: resultado.raffleId, rotulo: resultado.titulo },
      });
    }
    return resultado;
  } catch (err) {
    // Chave única violada é a outra transação tendo vencido a corrida: o
    // objetivo (ter uma campanha no ar) foi cumprido, só não por nós.
    if (violouChaveUnica(err)) return { ok: false, motivo: "JA_TEM_ATIVO" };

    const detalhe = err instanceof Error ? err.message : String(err);
    console.error("[cronograma] falha ao ativar", detalhe);
    await registrarFalha(cronograma.id, input.tenantId, detalhe);
    return { ok: false, motivo: "ERRO", detalhe };
  }
}

async function registrarFalha(
  scheduleId: string,
  tenantId: string,
  motivo: string,
): Promise<void> {
  await prisma.drawSchedule
    .update({
      where: { id: scheduleId },
      data: { ultimoErro: motivo.slice(0, 500), ultimoErroEm: new Date() },
    })
    .catch(() => {});
  await registrarLog({
    acao: "cronograma.falhou",
    tenantId,
    origem: "SISTEMA",
    ator: { nome: "Cronograma" },
    detalhes: { motivo: motivo.slice(0, 300) },
  });
}

// ---------------------------------------------------------------------------
// O CICLO TERMINOU
// ---------------------------------------------------------------------------

/**
 * O gancho do motor: este sorteio acabou de terminar.
 *
 * Chamado no único ponto em que a transmissão vira FINISHED de verdade, e
 * idempotente pelo mesmo mecanismo: fechar o item é um UPDATE com o status
 * anterior no WHERE, então a segunda chamada não fecha nada e não ativa nada.
 *
 * Nunca joga. Uma falha aqui não pode derrubar a finalização do sorteio, que é
 * a operação importante do momento.
 */
export async function handleDrawFinished(raffleId: string): Promise<void> {
  try {
    const item = await prisma.drawScheduleItem.findUnique({
      where: { raffleId },
      select: {
        id: true,
        status: true,
        scheduleId: true,
        schedule: {
          select: {
            id: true,
            tenantId: true,
            automacaoAtiva: true,
            atrasoEmSegundos: true,
          },
        },
      },
    });
    // Campanha fora da fila: o sorteio dela não é assunto do cronograma.
    if (!item) return;

    const fechou = await prisma.drawScheduleItem.updateMany({
      where: { id: item.id, status: "ATIVO" },
      data: { status: "CONCLUIDO", concluidoEm: new Date() },
    });
    // Já fechado: outra chamada chegou primeiro. Não ativa de novo.
    if (fechou.count !== 1) return;

    await registrarLog({
      acao: "cronograma.ciclo_concluido",
      tenantId: item.schedule.tenantId,
      origem: "SISTEMA",
      ator: { nome: "Cronograma" },
      alvo: { tipo: "Raffle", id: raffleId },
    });

    if (!item.schedule.automacaoAtiva) return;
    // Com atraso configurado, quem ativa é a varredura do cron, quando a hora
    // chegar. Segurar a resposta aqui prenderia a requisição do sorteio.
    if (item.schedule.atrasoEmSegundos > 0) return;

    await ativarProximo({
      tenantId: item.schedule.tenantId,
      origem: "AUTOMATICO",
      respeitarPausa: true,
    });
  } catch (err) {
    console.error("[cronograma] handleDrawFinished", raffleId, err);
  }
}

/**
 * A varredura do cron. Fecha ciclos que terminaram por fora e ativa o que já
 * pode entrar.
 *
 * Ela existe por três motivos, e nenhum deles é "ativar sorteio sozinho": o
 * atraso configurado (que não pode segurar a requisição do sorteio), o fim de
 * campanha por caminho manual (ganhador digitado, admin encerrando na mão) e a
 * nova tentativa depois de uma ativação que falhou.
 *
 * Ela NUNCA ativa sem contexto: só entra em ação quando existe um ciclo
 * concluído antes, e o atraso dele já venceu. Fila parada sem nada ter
 * terminado continua parada, esperando decisão de gente.
 */
export async function varrerCronogramas(agora: Date = new Date()): Promise<{
  concluidos: number;
  ativados: number;
}> {
  let concluidos = 0;
  let ativados = 0;

  const cronogramas = await prisma.drawSchedule.findMany({
    where: { automacaoAtiva: true },
    select: { id: true, tenantId: true, atrasoEmSegundos: true },
  });

  for (const cronograma of cronogramas) {
    try {
      // 1. O ativo terminou por fora do motor?
      const ativo = await prisma.drawScheduleItem.findFirst({
        where: { scheduleId: cronograma.id, status: "ATIVO" },
        select: {
          id: true,
          raffleId: true,
          raffle: {
            select: { status: true, draw: { select: { status: true } } },
          },
        },
      });

      if (ativo) {
        const campanhaParada = ativo.raffle.status !== "ACTIVE";
        const sorteio = ativo.raffle.draw;
        // Campanha esgotada com sorteio a caminho NÃO é ciclo concluído: ela
        // vira FINISHED no encerramento e a transmissão ainda vai acontecer.
        // Sorteio em ERROR também não fecha: ele pede gente olhando, e
        // empurrar a fila por cima de um erro esconderia o problema.
        const cicloAcabou =
          campanhaParada && (sorteio === null || sorteio.status === "FINISHED");
        if (!cicloAcabou) continue;

        const fechou = await prisma.drawScheduleItem.updateMany({
          where: { id: ativo.id, status: "ATIVO" },
          data: { status: "CONCLUIDO", concluidoEm: agora },
        });
        if (fechou.count === 1) {
          concluidos++;
          await registrarLog({
            acao: "cronograma.ciclo_concluido",
            tenantId: cronograma.tenantId,
            origem: "SISTEMA",
            ator: { nome: "Cronograma" },
            alvo: { tipo: "Raffle", id: ativo.raffleId },
          });
        }
      }

      // 2. Dá para ativar o próximo?
      const ultimoConcluido = await prisma.drawScheduleItem.findFirst({
        where: { scheduleId: cronograma.id, status: "CONCLUIDO" },
        orderBy: { concluidoEm: "desc" },
        select: { concluidoEm: true },
      });
      // Nada terminou ainda: a fila não começa sozinha.
      if (!ultimoConcluido?.concluidoEm) continue;

      const liberado = liberadoEm(
        ultimoConcluido.concluidoEm,
        cronograma.atrasoEmSegundos,
      );
      if (!liberado || liberado > agora) continue;

      const resultado = await ativarProximo({
        tenantId: cronograma.tenantId,
        origem: "AUTOMATICO",
        respeitarPausa: true,
      });
      if (resultado.ok) ativados++;
    } catch (err) {
      // Um painel que falha não pode levar os outros junto: a varredura é
      // global e roda para todos de uma vez.
      console.error("[cronograma] varredura", cronograma.id, err);
    }
  }

  return { concluidos, ativados };
}

// ---------------------------------------------------------------------------

async function itemDoTenant(itemId: string, tenantId: string) {
  return prisma.drawScheduleItem.findFirst({
    where: { id: itemId, schedule: { tenantId } },
    include: { raffle: { select: { title: true } } },
  });
}
