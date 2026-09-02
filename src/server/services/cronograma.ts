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
// UM CAMINHO SÓ: handleDrawFinished
//
// O gancho do motor e o reconciliador do cron chamam a MESMA função. O gancho
// é o caminho rápido (roda no mesmo processo que acabou de finalizar o
// sorteio) e o reconciliador é a rede (roda de minuto em minuto e encontra o
// que o gancho não terminou). Se a lógica morasse nos dois, o dia em que elas
// discordassem seria o dia em que duas campanhas subiriam juntas.
//
// O GATILHO É O FIM DE VERDADE
//
// Campanha vira FINISHED no instante em que ESGOTA, não quando o sorteio
// acontece: é assim que o motor congela o universo antes da transmissão. Usar
// isso como gatilho publicaria a próxima campanha dez minutos antes de a
// anterior revelar o ganhador. Por isso o gatilho é a transição do Draw para
// FINISHED, que o motor faz uma vez só, com guarda de status.
//
// A MEMÓRIA FICA NO BANCO, NUNCA EM MEMÓRIA
//
// `Draw.cronogramaProcessadoEm` responde "este fim já foi processado?" e
// `DrawSchedule.ativarApos` responde "a partir de que hora o próximo pode
// entrar?". Não existe setTimeout, nem fila em memória, nem processo que
// "está segurando" alguma coisa. Servidor que cai no meio volta e continua.
//
// AS TRÊS TRAVAS
//
// 1. ÍNDICE PARCIAL ÚNICO. Um item ATIVO por fila, cobrado pelo Postgres. É a
//    garantia que sobrevive a qualquer erro de raciocínio deste arquivo.
//
// 2. SELECT ... FOR UPDATE na linha da fila. Duas ativações simultâneas viram
//    uma fila indiana: a segunda só olha a fila depois que a primeira gravou.
//
// 3. GUARDA DE STATUS em toda escrita. Nenhuma transição é "ler, decidir,
//    escrever": é UPDATE com o estado anterior no WHERE, e quem leva o
//    `count: 1` faz o trabalho. É o que torna tudo idempotente.
//
// FALHA NÃO PULA NINGUÉM
//
// Se a ativação do próximo falhar, o item vira FALHOU e a fila PARA. Nada
// entra no lugar dele sozinho. Publicar a campanha seguinte por conta própria
// seria trocar um problema conhecido (a fila parada, com aviso na tela) por um
// desconhecido: a skin errada no ar às três da manhã.

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

/**
 * Quem mandou ativar. Fica gravado no item e no histórico.
 *
 * A diferença entre AUTOMATICO e RECUPERACAO importa na auditoria: a primeira
 * é a fila andando como deveria, a segunda é o reconciliador consertando um
 * fim que ficou pela metade. Ver as duas no histórico é o que permite
 * descobrir que o gancho anda morrendo sem ninguém notar.
 */
export type OrigemDaAtivacao = "AUTOMATICO" | "MANUAL" | "RECUPERACAO";

export type FalhaDaAtivacao =
  | "AUTOMACAO_PAUSADA"
  | "FILA_BLOQUEADA"
  | "JA_TEM_ATIVO"
  | "FILA_VAZIA"
  | "ITEM_FORA_DA_FILA"
  | "CAMPANHA_MUDOU"
  | "CORRIDA"
  | "ERRO";

export type ResultadoDaAtivacao =
  | { ok: true; raffleId: string; titulo: string; itemId: string }
  | { ok: false; motivo: FalhaDaAtivacao; detalhe?: string };

/** Quantos fins pendentes o reconciliador processa por passada. */
const LOTE_DA_RECUPERACAO = 20;

// ---------------------------------------------------------------------------
// A FILA
// ---------------------------------------------------------------------------

/**
 * A fila do painel, criada na primeira vez que alguém precisa dela.
 *
 * `upsert` e não "busca, se não achar cria": duas abas abrindo o cronograma no
 * mesmo segundo criariam duas filas, e a chave única do tenant transformaria
 * isso num erro na cara do admin.
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

/** A fila inteira, com o que a tela do painel precisa mostrar. */
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
          images: { where: { isCover: true }, take: 1, select: { url: true } },
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
      _count: { select: { prizes: true } },
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
 * última posição. Recolocar uma campanha que já esteve na fila reaproveita a
 * linha, e o histórico dela fica num lugar só.
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
    alvo: {
      tipo: "Raffle",
      id: input.raffleId,
      rotulo: validacao.titulo ?? undefined,
    },
    detalhes: { posicao: item.posicao },
  });

  return { ok: true, itemId: item.id };
}

/**
 * Adota uma campanha que JÁ ESTÁ no ar como o item ativo da fila.
 *
 * Existe para o primeiro dia. Sem isto, a fila só começaria a valer depois que
 * a campanha do momento terminasse por fora dela.
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
  await limparBloqueioSeResolvido(input.tenantId);
  return { ok: true };
}

/**
 * Pula neste ciclo.
 *
 * A campanha continua QUEUED, ou seja, preparada e invisível: pular é sobre a
 * VEZ dela, não sobre o trabalho feito nela. E é o único jeito de destravar
 * uma fila parada por falha, o que é de propósito: quem decide abandonar a
 * campanha que não subiu é gente, não o sistema.
 */
export async function pularItem(input: {
  tenantId: string;
  itemId: string;
}): Promise<{ ok: boolean; erro?: string }> {
  const item = await itemDoTenant(input.itemId, input.tenantId);
  if (!item) return { ok: false, erro: "Item não encontrado." };

  const mudou = await prisma.drawScheduleItem.updateMany({
    where: { id: item.id, status: { in: ["AGUARDANDO", "FALHOU"] } },
    data: { status: "PULADO", puladoEm: new Date(), erro: null },
  });
  if (mudou.count !== 1) {
    return { ok: false, erro: "Só dá para pular quem está aguardando." };
  }

  await registrarLog({
    acao: "cronograma.pulado",
    tenantId: input.tenantId,
    alvo: { tipo: "Raffle", id: item.raffleId, rotulo: item.raffle.title },
  });
  await limparBloqueioSeResolvido(input.tenantId);
  return { ok: true };
}

/**
 * Tenta de novo o item que falhou, sem mudar o lugar dele na fila.
 *
 * É o botão do aviso de erro. Devolver para o fim da fila (que é o que
 * `devolverParaFila` faz) resolveria o bloqueio e trocaria a ordem do dia sem
 * ninguém pedir: quem clica em "tentar novamente" está dizendo "consertei,
 * sobe esta agora", e não "manda para o fim".
 */
export async function tentarNovamente(input: {
  tenantId: string;
  itemId: string;
}): Promise<ResultadoDaAtivacao> {
  const item = await itemDoTenant(input.itemId, input.tenantId);
  if (!item) return { ok: false, motivo: "ITEM_FORA_DA_FILA" };

  const voltou = await prisma.drawScheduleItem.updateMany({
    where: { id: item.id, status: "FALHOU" },
    data: { status: "AGUARDANDO", erro: null },
  });
  if (voltou.count !== 1) return { ok: false, motivo: "ITEM_FORA_DA_FILA" };

  const r = await ativarProximo({
    tenantId: input.tenantId,
    origem: "MANUAL",
    itemId: item.id,
  });
  // Falhou de novo: o item volta a travar a fila, e o aviso continua na tela.
  if (!r.ok && r.motivo === "CAMPANHA_MUDOU") return r;
  if (r.ok) await limparBloqueioSeResolvido(input.tenantId);
  return r;
}

/** Devolve para o fim da fila quem foi pulado, removido ou falhou. */
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
 * Só os que AGUARDAM entram: o item ativo é o sorteio que está no ar, e mudar
 * a posição dele não significaria nada. Renumera de zero em vez de trocar dois
 * valores, o que mantém a fila previsível depois de uma sequência de arrastos.
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

/**
 * Liga e desliga a troca automática.
 *
 * Não mexe em quem já está no ar e não mexe no erro: pausa é intenção do
 * admin, erro é estado operacional, e o painel mostra os dois separados.
 */
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
 * acontece. Estado parcial aqui seria campanha publicada sem dono na fila, e
 * ninguém saberia quem ativar depois.
 *
 * FALHA NÃO PULA. Se o item da vez não puder subir, ele vira FALHOU e a fila
 * para até alguém pular ou consertar. A ativação manual de um item específico
 * é a exceção: ali quem escolheu foi gente, e a fila não fica bloqueada por
 * uma escolha que ela mesma pode refazer.
 */
export async function ativarProximo(input: {
  tenantId: string;
  origem: OrigemDaAtivacao;
  /** Quando vem, ativa este item. Sem ele, o primeiro que aguarda. */
  itemId?: string;
  /** Só para os caminhos automáticos: respeita a pausa e o bloqueio. */
  respeitarPausa?: boolean;
}): Promise<ResultadoDaAtivacao> {
  const cronograma = await garantirCronograma(input.tenantId);
  if (input.respeitarPausa && !cronograma.automacaoAtiva) {
    return { ok: false, motivo: "AUTOMACAO_PAUSADA" };
  }

  // A FILA BLOQUEADA POR FALHA.
  //
  // Um item que não subiu segura a fila inteira, e isso é o desenho, não um
  // efeito colateral: publicar a campanha seguinte por conta própria trocaria
  // um problema visível (fila parada, aviso na tela) por um invisível (a skin
  // errada no ar). Só um comando humano (pular, remover, tentar de novo)
  // destrava.
  if (input.respeitarPausa) {
    const travado = await prisma.drawScheduleItem.findFirst({
      where: { scheduleId: cronograma.id, status: "FALHOU" },
      select: { id: true },
    });
    if (travado) return { ok: false, motivo: "FILA_BLOQUEADA" };
  }

  let alvoQueFalhou: { id: string; raffleId: string } | null = null;

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
        alvoQueFalhou = { id: alvo.id, raffleId: alvo.raffleId };

        const campanha = await tx.raffle.findFirst({
          where: { id: alvo.raffleId, tenantId: input.tenantId },
          select: { id: true, title: true, status: true },
        });
        if (!campanha) return { ok: false, motivo: "CAMPANHA_MUDOU" };

        // A campanha só sobe se ainda estiver QUEUED. É a guarda que impede
        // republicar uma campanha que saiu da fila por outra tela entre a
        // leitura e a escrita.
        const publicou = await tx.raffle.updateMany({
          where: { id: alvo.raffleId, status: "QUEUED" },
          data: { status: "ACTIVE" },
        });
        if (publicou.count !== 1) {
          return {
            ok: false,
            motivo: "CAMPANHA_MUDOU",
            detalhe: `A campanha "${campanha.title}" não estava mais pronta para subir (situação: ${campanha.status}).`,
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
      // Deu certo: some o erro anterior e a hora de liberação, que já foi
      // cumprida. Sem isto, o reconciliador tentaria ativar de novo no minuto
      // seguinte, e o painel continuaria mostrando um erro resolvido.
      await prisma.drawSchedule.update({
        where: { id: cronograma.id },
        data: { ultimoErro: null, ultimoErroEm: null, ativarApos: null },
      });
      await registrarLog({
        acao: acaoDeAtivacao(input.origem),
        tenantId: input.tenantId,
        origem: input.origem === "MANUAL" ? "PAINEL" : "SISTEMA",
        ...(input.origem === "MANUAL" ? {} : { ator: { nome: "Cronograma" } }),
        alvo: {
          tipo: "Raffle",
          id: resultado.raffleId,
          rotulo: resultado.titulo,
        },
      });
      return resultado;
    }

    // Falha de verdade (a campanha não estava pronta) trava a fila. "Já tem
    // ativo", "fila vazia" e "corrida" não são falhas: são a fila dizendo que
    // não há o que fazer agora.
    if (resultado.motivo === "CAMPANHA_MUDOU" && alvoQueFalhou) {
      await bloquearFila(
        cronograma.id,
        input.tenantId,
        alvoQueFalhou,
        resultado.detalhe ?? "A campanha não estava pronta para subir.",
      );
    }
    return resultado;
  } catch (err) {
    if (violouChaveUnica(err)) return { ok: false, motivo: "JA_TEM_ATIVO" };

    const detalhe = err instanceof Error ? err.message : String(err);
    console.error("[cronograma] falha ao ativar", detalhe);
    await bloquearFila(cronograma.id, input.tenantId, alvoQueFalhou, detalhe);
    return { ok: false, motivo: "ERRO", detalhe };
  }
}

function acaoDeAtivacao(origem: OrigemDaAtivacao) {
  if (origem === "MANUAL") return "cronograma.ativado_manual" as const;
  if (origem === "RECUPERACAO") return "cronograma.ativado_recuperacao" as const;
  return "cronograma.ativado_auto" as const;
}

/**
 * Marca a falha: no item, para a fila parar nele, e no cronograma, para o
 * painel mostrar o aviso com "tentar novamente".
 *
 * Não desliga a automação. A intenção do admin continua sendo "trocar
 * sozinho"; o que existe é um erro impedindo, e as duas coisas precisam
 * aparecer separadas na tela.
 */
async function bloquearFila(
  scheduleId: string,
  tenantId: string,
  alvo: { id: string; raffleId: string } | null,
  motivo: string,
): Promise<void> {
  const curto = motivo.slice(0, 500);
  let titulo: string | undefined;
  try {
    if (alvo) {
      await prisma.drawScheduleItem.updateMany({
        where: { id: alvo.id, status: "AGUARDANDO" },
        data: { status: "FALHOU", erro: curto },
      });
      titulo =
        (
          await prisma.raffle.findUnique({
            where: { id: alvo.raffleId },
            select: { title: true },
          })
        )?.title ?? undefined;
    }
    await prisma.drawSchedule.update({
      where: { id: scheduleId },
      data: { ultimoErro: curto, ultimoErroEm: new Date() },
    });
  } catch (err) {
    console.error("[cronograma] falha ao registrar a falha", err);
  }
  await registrarLog({
    acao: "cronograma.falhou",
    tenantId,
    origem: "SISTEMA",
    ator: { nome: "Cronograma" },
    // O alvo é a CAMPANHA, e não o item: é o nome dela que o histórico precisa
    // dizer para alguém entender o aviso sem abrir o banco.
    ...(alvo
      ? { alvo: { tipo: "Raffle" as const, id: alvo.raffleId, rotulo: titulo } }
      : {}),
    detalhes: { motivo: curto.slice(0, 300) },
  });
}

/**
 * Some com o aviso de erro quando não sobrou nenhum item travado.
 *
 * Chamado depois de pular e de remover, que são os dois comandos humanos que
 * destravam a fila. O aviso não pode sobreviver ao problema: um banner
 * vermelho permanente vira paisagem e some da atenção justamente quando
 * aparecer de verdade.
 */
async function limparBloqueioSeResolvido(tenantId: string): Promise<void> {
  const cronograma = await prisma.drawSchedule.findUnique({
    where: { tenantId },
    select: { id: true, ultimoErro: true },
  });
  if (!cronograma?.ultimoErro) return;
  const aindaTravado = await prisma.drawScheduleItem.count({
    where: { scheduleId: cronograma.id, status: "FALHOU" },
  });
  if (aindaTravado > 0) return;
  await prisma.drawSchedule.update({
    where: { id: cronograma.id },
    data: { ultimoErro: null, ultimoErroEm: null },
  });
}

// ---------------------------------------------------------------------------
// O CICLO TERMINOU: UM CAMINHO SÓ
// ---------------------------------------------------------------------------

export interface ResultadoDaFinalizacao {
  /**
   * PROCESSADO: este fim foi fechado agora, por esta chamada.
   * JA_PROCESSADO: outra chamada chegou primeiro, ou o fim não vale mais.
   * FORA_DA_FILA: a campanha não faz parte do cronograma.
   */
  situacao: "PROCESSADO" | "JA_PROCESSADO" | "FORA_DA_FILA";
  /**
   * A ativação do próximo aconteceu nesta mesma chamada.
   *
   * Existe para quem chama poder contar direito. Sem intervalo configurado, a
   * ativação acontece aqui dentro; com intervalo, ela fica para o
   * reconciliador. Um contador que só somasse o segundo caminho diria "zero
   * ativações" num dia inteiro de fila andando.
   */
  ativou: boolean;
}

/**
 * ESTE SORTEIO ACABOU. A função central, e a única porta.
 *
 * O gancho do motor chama daqui, no mesmo processo que acabou de finalizar a
 * transmissão. O reconciliador do cron chama daqui, quando encontra um fim que
 * ninguém processou. As duas entradas, a mesma regra.
 *
 * A idempotência tem duas camadas, e a de baixo é o que sobrevive a queda de
 * servidor: `Draw.cronogramaProcessadoEm` é reivindicado com um UPDATE que
 * exige a coluna nula, então só uma chamada no mundo inteiro faz o trabalho,
 * mesmo que dez aconteçam no mesmo segundo em máquinas diferentes.
 *
 * Nunca joga: uma falha aqui não pode derrubar a finalização do sorteio, que é
 * a operação importante do momento.
 */
export async function handleDrawFinished(
  raffleId: string,
  origem: OrigemDaAtivacao = "AUTOMATICO",
): Promise<ResultadoDaFinalizacao> {
  try {
    const item = await prisma.drawScheduleItem.findUnique({
      where: { raffleId },
      select: {
        id: true,
        status: true,
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

    const draw = await prisma.draw.findUnique({
      where: { raffleId },
      select: { id: true, status: true, cronogramaProcessadoEm: true },
    });

    // A reivindicação. Campanha sem sorteio automático (ganhador digitado,
    // encerramento manual) não tem linha em Draw, e aí a idempotência fica por
    // conta da guarda de status do item, logo abaixo.
    const agora = new Date();
    if (draw) {
      if (draw.status !== "FINISHED") {
        return { situacao: "JA_PROCESSADO", ativou: false };
      }
      const reivindicou = await prisma.draw.updateMany({
        where: { id: draw.id, cronogramaProcessadoEm: null },
        data: { cronogramaProcessadoEm: agora },
      });
      if (reivindicou.count !== 1) {
        return { situacao: "JA_PROCESSADO", ativou: false };
      }
    }

    // Campanha fora da fila: o sorteio dela não é assunto do cronograma. A
    // marca no Draw já foi gravada, então o reconciliador não volta aqui.
    if (!item) return { situacao: "FORA_DA_FILA", ativou: false };

    const fechou = await prisma.drawScheduleItem.updateMany({
      where: { id: item.id, status: "ATIVO" },
      data: { status: "CONCLUIDO", concluidoEm: agora },
    });
    if (fechou.count !== 1) {
      return { situacao: "JA_PROCESSADO", ativou: false };
    }

    await registrarLog({
      acao: "cronograma.ciclo_concluido",
      tenantId: item.schedule.tenantId,
      origem: "SISTEMA",
      ator: { nome: "Cronograma" },
      alvo: { tipo: "Raffle", id: raffleId },
    });

    // A HORA DE LIBERAÇÃO, GRAVADA. Mesmo sem atraso: assim o reconciliador
    // enxerga a ativação pendente se o processo morrer nas próximas linhas.
    const liberacao = liberadoEm(agora, item.schedule.atrasoEmSegundos)!;
    await prisma.drawSchedule.update({
      where: { id: item.schedule.id },
      data: { ativarApos: liberacao },
    });

    if (!item.schedule.automacaoAtiva) {
      return { situacao: "PROCESSADO", ativou: false };
    }
    // Com atraso, quem ativa é o reconciliador quando a hora chegar. Segurar a
    // resposta aqui prenderia a requisição do sorteio, e um setTimeout morreria
    // no primeiro deploy.
    if (liberacao > new Date()) {
      return { situacao: "PROCESSADO", ativou: false };
    }

    const ativacao = await ativarProximo({
      tenantId: item.schedule.tenantId,
      origem,
      respeitarPausa: true,
    });
    return { situacao: "PROCESSADO", ativou: ativacao.ok };
  } catch (err) {
    console.error("[cronograma] handleDrawFinished", raffleId, err);
    return { situacao: "JA_PROCESSADO", ativou: false };
  }
}

/**
 * O RECONCILIADOR. Roda de minuto em minuto, junto do cron do sorteio.
 *
 * Ele existe para três buracos, e nenhum deles é "ativar sorteio sozinho":
 *
 * 1. O gancho que não terminou. O processo pode morrer entre a transição do
 *    sorteio para FINISHED e a ativação do próximo. Sorteio finalizado com
 *    `cronogramaProcessadoEm` nulo é exatamente isso, e é a primeira coisa que
 *    ele procura.
 *
 * 2. O intervalo configurado. A hora de liberação está gravada; ele só
 *    pergunta se já passou.
 *
 * 3. A campanha encerrada por fora do motor (ganhador digitado, admin mudando
 *    o status na mão). Ali não existe Draw para disparar gancho nenhum.
 *
 * Ele NUNCA começa uma fila parada: sem um ciclo concluído antes, com hora de
 * liberação gravada, ele não ativa nada.
 */
export async function varrerCronogramas(agora: Date = new Date()): Promise<{
  finalizacoesProcessadas: number;
  ativados: number;
}> {
  let finalizacoesProcessadas = 0;
  let ativados = 0;

  // 1. Os fins que ninguém processou. Mesma função do gancho, origem
  //    RECUPERACAO para o histórico dizer que foi conserto e não rotina.
  const pendentes = await prisma.draw.findMany({
    where: {
      status: "FINISHED",
      cronogramaProcessadoEm: null,
      // Só sorteio de campanha que ESTÁ numa fila. O site tem campanha fora do
      // cronograma, e o fim delas não é assunto daqui: sem este filtro o
      // reconciliador reivindicaria linha por linha o histórico inteiro de
      // sorteios do painel só para descobrir, uma a uma, que não tem nada a
      // fazer com elas.
      raffle: { itemDoCronograma: { isNot: null } },
    },
    orderBy: { finishedAt: "asc" },
    take: LOTE_DA_RECUPERACAO,
    select: { raffleId: true },
  });
  for (const draw of pendentes) {
    const r = await handleDrawFinished(draw.raffleId, "RECUPERACAO");
    if (r.situacao === "PROCESSADO") finalizacoesProcessadas++;
    if (r.ativou) ativados++;
  }

  const cronogramas = await prisma.drawSchedule.findMany({
    where: { automacaoAtiva: true },
    select: { id: true, tenantId: true, atrasoEmSegundos: true, ativarApos: true },
  });

  for (const cronograma of cronogramas) {
    try {
      // 2. A campanha que acabou por fora do motor. Campanha esgotada com
      //    sorteio a caminho NÃO é ciclo concluído: ela vira FINISHED no
      //    encerramento e a transmissão ainda vai acontecer. Sorteio em ERROR
      //    também não fecha: ele pede gente olhando, e empurrar a fila por
      //    cima de um erro esconderia o problema.
      const ativo = await prisma.drawScheduleItem.findFirst({
        where: { scheduleId: cronograma.id, status: "ATIVO" },
        select: {
          raffleId: true,
          raffle: {
            select: { status: true, draw: { select: { status: true } } },
          },
        },
      });
      if (ativo && ativo.raffle.status !== "ACTIVE" && !ativo.raffle.draw) {
        const r = await handleDrawFinished(ativo.raffleId, "RECUPERACAO");
        if (r.situacao === "PROCESSADO") finalizacoesProcessadas++;
        if (r.ativou) ativados++;
      }

      // 3. A ativação pendente cuja hora chegou.
      const atual = await prisma.drawSchedule.findUnique({
        where: { id: cronograma.id },
        select: { ativarApos: true, automacaoAtiva: true },
      });
      if (!atual?.automacaoAtiva) continue;
      if (!atual.ativarApos || atual.ativarApos > agora) continue;

      const r = await ativarProximo({
        tenantId: cronograma.tenantId,
        origem: "RECUPERACAO",
        respeitarPausa: true,
      });
      if (r.ok) {
        ativados++;
      } else if (r.motivo === "FILA_VAZIA") {
        // Fila vazia não é pendência: limpa a hora para o reconciliador parar
        // de acordar por causa dela todo minuto.
        await prisma.drawSchedule.update({
          where: { id: cronograma.id },
          data: { ativarApos: null },
        });
      }
    } catch (err) {
      // Um painel que falha não pode levar os outros junto: a varredura é
      // global e roda para todos de uma vez.
      console.error("[cronograma] varredura", cronograma.id, err);
    }
  }

  return { finalizacoesProcessadas, ativados };
}

// ---------------------------------------------------------------------------

async function itemDoTenant(itemId: string, tenantId: string) {
  return prisma.drawScheduleItem.findFirst({
    where: { id: itemId, schedule: { tenantId } },
    include: { raffle: { select: { title: true } } },
  });
}
