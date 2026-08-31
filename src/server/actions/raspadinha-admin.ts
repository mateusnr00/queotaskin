"use server";

// O cadastro da raspadinha, do painel.
//
// A mecânica existia inteira no banco e na hora de raspar, mas não havia por
// onde cadastrar nada: o botão do painel abria um aviso de "em breve", e sem
// prêmio nenhum a raspadinha nunca chegava ao público. Estas ações são o que
// faltava para ela sair do papel.
//
// Espelham as da caixa surpresa de propósito. As duas mecânicas são a mesma
// coisa por baixo, um bolo de prêmios sorteado no instante da revelação, e
// divergir na forma de cadastrar só criaria duas telas para aprender.

import { revalidatePath } from "next/cache";
import { chaveDoNome, raridadeDoPremio } from "@/lib/premio-nome";
import type { SkinRarity } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { assertRaffleInActiveTenant } from "@/lib/tenant";
import { registrarLog } from "@/server/services/activity-log";
import { gerarRaspadinhasParaReserva } from "@/server/services/raspadinhas";
import { agendarSaida } from "@/lib/saida";
import type { ActionResult } from "@/server/actions/auth";

/** Recarrega a tela de onde o cadastro é feito. */
function recarregar(raffleId: string) {
  revalidatePath(`/admin/sorteios/${raffleId}/compras`);
}

const configSchema = z.object({
  raffleId: z.string().min(1),
  ativa: z.boolean(),
  rasparTodas: z.boolean(),
});

/** Liga a mecânica e o botão de raspar todas de uma vez. */
export async function salvarConfigDaRaspadinhaAction(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = configSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    const { raffleId, ativa, rasparTodas } = parsed.data;
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    await prisma.raffle.update({
      where: { id: raffleId },
      data: {
        raspadinhaEnabled: ativa,
        raspadinhaRasparTodas: rasparTodas,
      },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "configuração da raspadinha", ativa },
    });
    recarregar(raffleId);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[salvarConfigDaRaspadinhaAction]", err);
    return { ok: false, error: "Erro ao salvar a configuração" };
  }
}

const combosSchema = z.object({
  raffleId: z.string().min(1),
  combos: z
    .array(
      z.object({
        minimo: z.coerce.number().int().min(1),
        quantidade: z.coerce.number().int().min(1),
        visivel: z.boolean().default(true),
      }),
    )
    .max(20),
});

/**
 * Quantos títulos dão quantas raspadinhas.
 *
 * Substitui a lista inteira em vez de casar item a item: o painel edita uma
 * tabela pequena de uma vez, e reconciliar linha por linha só criaria estados
 * intermediários possíveis de gravar pela metade.
 */
export async function salvarCombosDaRaspadinhaAction(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = combosSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    const { raffleId, combos } = parsed.data;
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    // Dois combos no mesmo mínimo é ambíguo, e o banco recusaria com um erro
    // que não diz nada. Recusar aqui explica o que houve.
    const minimos = new Set(combos.map((c) => c.minimo));
    if (minimos.size !== combos.length) {
      return { ok: false, error: "Há dois combos com o mesmo mínimo." };
    }

    await prisma.$transaction([
      prisma.raspadinhaCombo.deleteMany({ where: { raffleId } }),
      prisma.raspadinhaCombo.createMany({
        data: combos.map((c) => ({ ...c, raffleId })),
      }),
    ]);

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "combos da raspadinha", quantos: combos.length },
    });
    recarregar(raffleId);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[salvarCombosDaRaspadinhaAction]", err);
    return { ok: false, error: "Erro ao salvar os combos" };
  }
}

const premioSchema = z.object({
  raffleId: z.string().min(1),
  rotulo: z.string().min(1).max(200),
  /** Em reais, quando é Pix. Serve para somar quanto já foi dado. */
  valor: z.coerce.number().min(0).max(99_999_999).optional().nullable(),
  quantidade: z.coerce.number().int().min(1).max(100),
  chance: z.coerce.number().min(0).max(100).optional().nullable(),
  travado: z.boolean().default(false),
});

/**
 * Cria N unidades do mesmo prêmio, cada uma com o seu ponto de saída.
 *
 * Uma linha por unidade, como na caixa: é o que permite cada uma sair na sua
 * hora e ser bloqueada sozinha. Cada uma puxa a anterior, e é isso que faz
 * elas saírem uma atrás da outra em vez de caírem no mesmo ponto.
 */
export async function criarPremiosDaRaspadinhaAction(
  raw: unknown,
): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await getAdminOrThrow();
    const parsed = premioSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const { raffleId, rotulo, valor, quantidade, chance, travado } =
      parsed.data;
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    const [vendidos, ultimo, campanha] = await Promise.all([
      prisma.ticket.count({ where: { raffleId, status: "PAID" } }),
      prisma.raspadinhaPremio.findFirst({
        where: { raffleId, saidaEmTitulos: { not: null } },
        orderBy: { saidaEmTitulos: "desc" },
        select: { saidaEmTitulos: true },
      }),
      prisma.raffle.findUnique({
        where: { id: raffleId },
        select: { totalNumbers: true },
      }),
    ]);
    const total = campanha?.totalNumbers ?? 0;
    let ultimoAgendado = ultimo?.saidaEmTitulos ?? null;

    // O TIPO SAI DO NOME, E NÃO DE UM SELETOR.
    //
    // O cadastro tinha um seletor de Pix ou skin, e ele obrigava a encaixar em
    // uma das duas caixas um prêmio que pode ser uma peça de computador. Agora
    // o prêmio é o que se digita, e a classificação é conferida contra o
    // catálogo do tenant, do mesmo jeito que a caixa surpresa já fazia com a
    // raridade. Nome que não é skin fica sem raridade e sem cor, que é o caso
    // normal de "R$ 250 no Pix" e de "Placa de vídeo RTX 4070".
    const catalogo = new Map<string, SkinRarity | null>(
      (
        await prisma.skinTemplate.findMany({
          where: { tenantId },
          select: { name: true, skinRarity: true },
        })
      ).map((sk) => [chaveDoNome(sk.name), sk.skinRarity]),
    );
    const nome = rotulo.trim();
    const ehSkin = catalogo.has(chaveDoNome(nome));
    const skinRarity = raridadeDoPremio(nome, catalogo);

    const linhas = Array.from({ length: quantidade }, () => {
      const ponto = agendarSaida({ vendidos, total, ultimoAgendado });
      ultimoAgendado = ponto;
      return {
        raffleId,
        // Continua gravado, mas como classificação e não como escolha de quem
        // cadastra: o público mostra o que foi digitado, seja o que for.
        tipo: ehSkin ? ("SKIN" as const) : ("PIX" as const),
        rotulo: nome,
        skinRarity,
        // O valor é opcional e serve ao total do painel, "quanto já está
        // prometido". Não decide mais o que aparece para quem ganhou.
        valor: valor != null ? valor : null,
        chance: chance != null ? chance : null,
        travado,
        saidaEmTitulos: ponto,
      };
    });

    const result = await prisma.raspadinhaPremio.createMany({ data: linhas });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "prêmios da raspadinha", quantos: result.count },
    });
    recarregar(raffleId);
    return { ok: true, data: { count: result.count } };
  } catch (err) {
    console.error("[criarPremiosDaRaspadinhaAction]", err);
    return { ok: false, error: "Erro ao cadastrar o prêmio" };
  }
}

const idSchema = z.object({ premioId: z.string().min(1) });

/** Guarda o prêmio, ou solta. Já sorteado não volta atrás. */
export async function travarPremioDaRaspadinhaAction(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = idSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const premio = await prisma.raspadinhaPremio.findUnique({
      where: { id: parsed.data.premioId },
      select: { raffleId: true, travado: true, claimedAt: true },
    });
    if (!premio) return { ok: false, error: "Prêmio não encontrado" };
    const tenantId = await assertRaffleInActiveTenant(
      premio.raffleId,
      session.user,
    );
    if (premio.claimedAt) {
      return { ok: false, error: "Prêmio já saiu, não pode ser travado" };
    }

    await prisma.raspadinhaPremio.update({
      where: { id: parsed.data.premioId },
      data: { travado: !premio.travado },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: premio.raffleId },
      detalhes: { o_que: "trava de prêmio da raspadinha" },
    });
    recarregar(premio.raffleId);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[travarPremioDaRaspadinhaAction]", err);
    return { ok: false, error: "Erro ao alterar a trava" };
  }
}

/** Remove uma unidade. Já sorteada fica: é histórico de quem ganhou. */
export async function removerPremioDaRaspadinhaAction(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = idSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const premio = await prisma.raspadinhaPremio.findUnique({
      where: { id: parsed.data.premioId },
      select: { raffleId: true, claimedAt: true },
    });
    if (!premio) return { ok: false, error: "Prêmio não encontrado" };
    const tenantId = await assertRaffleInActiveTenant(
      premio.raffleId,
      session.user,
    );
    if (premio.claimedAt) {
      return {
        ok: false,
        error: "Prêmio já saiu para alguém e não pode ser removido",
      };
    }

    await prisma.raspadinhaPremio.delete({
      where: { id: parsed.data.premioId },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: premio.raffleId },
      detalhes: { o_que: "remoção de prêmio da raspadinha" },
    });
    recarregar(premio.raffleId);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[removerPremioDaRaspadinhaAction]", err);
    return { ok: false, error: "Erro ao remover o prêmio" };
  }
}

const saidaSchema = z.object({
  premioId: z.string().min(1),
  tipoDeSaida: z.enum(["PROGRESSO", "PERSONALIZADO"]),
  porcentagem: z.coerce.number().min(0).max(100).optional().nullable(),
  titulosDe: z.coerce.number().int().min(1).optional().nullable(),
  titulosAte: z.coerce.number().int().min(1).optional().nullable(),
  dataDe: z.string().optional().nullable(),
  dataAte: z.string().optional().nullable(),
  ddds: z.array(z.string().regex(/^\d{2}$/)).default([]),
});

/**
 * Configurações de saída de UMA unidade.
 *
 * Igual à da caixa: a tela fala em porcentagem porque é como se pensa a
 * campanha, e a conta para título é feita aqui, com o total em mãos, e não no
 * navegador, onde um total desatualizado gravaria o ponto errado.
 */
export async function salvarSaidaDaRaspadinhaAction(
  raw: unknown,
): Promise<ActionResult<{ saidaEmTitulos: number | null }>> {
  try {
    const session = await getAdminOrThrow();
    const parsed = saidaSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    const d = parsed.data;

    const premio = await prisma.raspadinhaPremio.findUnique({
      where: { id: d.premioId },
      select: { raffleId: true, claimedAt: true },
    });
    if (!premio) return { ok: false, error: "Prêmio não encontrado" };
    const tenantId = await assertRaffleInActiveTenant(
      premio.raffleId,
      session.user,
    );
    if (premio.claimedAt) {
      return { ok: false, error: "Prêmio já saiu, não dá para reagendar" };
    }

    if (
      d.tipoDeSaida === "PERSONALIZADO" &&
      d.titulosDe != null &&
      d.titulosAte != null &&
      d.titulosDe > d.titulosAte
    ) {
      return { ok: false, error: "A faixa de títulos está invertida." };
    }
    const de = d.dataDe ? new Date(d.dataDe) : null;
    const ate = d.dataAte ? new Date(d.dataAte) : null;
    if (de && ate && de > ate) {
      return { ok: false, error: "A janela de datas está invertida." };
    }

    const campanha = await prisma.raffle.findUnique({
      where: { id: premio.raffleId },
      select: { totalNumbers: true },
    });
    const total = campanha?.totalNumbers ?? 0;
    const emTitulos =
      d.tipoDeSaida === "PROGRESSO" && d.porcentagem != null && total > 0
        ? Math.min(total, Math.max(1, Math.ceil((d.porcentagem / 100) * total)))
        : null;

    await prisma.raspadinhaPremio.update({
      where: { id: d.premioId },
      data: {
        tipoDeSaida: d.tipoDeSaida,
        saidaEmTitulos: emTitulos,
        saidaTitulosDe: d.tipoDeSaida === "PERSONALIZADO" ? d.titulosDe : null,
        saidaTitulosAte:
          d.tipoDeSaida === "PERSONALIZADO" ? d.titulosAte : null,
        saidaDataDe: d.tipoDeSaida === "PERSONALIZADO" ? de : null,
        saidaDataAte: d.tipoDeSaida === "PERSONALIZADO" ? ate : null,
        saidaDdds: d.tipoDeSaida === "PERSONALIZADO" ? d.ddds : [],
      },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: premio.raffleId },
      detalhes: { o_que: "saída de prêmio da raspadinha", tipo: d.tipoDeSaida },
    });
    recarregar(premio.raffleId);
    return { ok: true, data: { saidaEmTitulos: emTitulos } };
  } catch (err) {
    console.error("[salvarSaidaDaRaspadinhaAction]", err);
    return { ok: false, error: "Erro ao salvar a saída" };
  }
}

/** O que a conferência achou, para a tela poder explicar em vez de só somar. */
export interface ConferenciaDeRaspadinhas {
  /** Reservas pagas olhadas nesta passada. */
  conferidas: number;
  /** Bilhetes criados agora, que estavam faltando. */
  criadas: number;
  /** Compras que não alcançaram nenhum combo. Não é defeito, é regra. */
  semCombo: number;
  /** Ficou gente de fora do teto desta passada: rodar de novo continua. */
  faltouOlhar: number;
  /** Por que nada foi criado, quando nada foi criado. */
  motivo: string | null;
}

/** Quantas passadas por vez, para a ação não estourar o tempo do servidor. */
const TETO_DA_CONFERENCIA = 400;

/**
 * Confere as compras pagas e cria as raspadinhas que faltaram.
 *
 * EXISTE PORQUE JÁ FALTOU. A geração andava em três dos seis caminhos de
 * confirmação de pagamento, e quem pagou por um dos outros três ficou sem
 * bilhete nenhum. Corrigir o código conserta as compras seguintes e não
 * devolve nada a quem já pagou: essas compras continuam paradas no banco, sem
 * as raspadinhas a que tinham direito, e não há tela onde isso apareça.
 *
 * Idempotente do começo ao fim, porque reaproveita o mesmo serviço da
 * confirmação de pagamento: quem já tem os bilhetes não ganha mais nenhum, e
 * apertar duas vezes não dobra nada. Por isso pode ser apertado sem medo
 * sempre que a suspeita aparecer.
 *
 * Não inventa combo nem prêmio: compra que não alcançou nenhum degrau continua
 * sem raspadinha, e a resposta diz quantas foram assim, para o número zero
 * poder ser explicado em vez de virar mistério.
 */
export async function conferirRaspadinhasAction(
  raw: unknown,
): Promise<ActionResult<ConferenciaDeRaspadinhas>> {
  try {
    const session = await getAdminOrThrow();
    const parsed = z.object({ raffleId: z.string().min(1) }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    const { raffleId } = parsed.data;
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    const rifa = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { raspadinhaEnabled: true },
    });
    if (!rifa) return { ok: false, error: "Sorteio não encontrado" };

    const vazio = { conferidas: 0, criadas: 0, semCombo: 0, faltouOlhar: 0 };
    if (!rifa.raspadinhaEnabled) {
      return {
        ok: true,
        data: {
          ...vazio,
          motivo: "A raspadinha está desligada nesta campanha.",
        },
      };
    }

    const combos = await prisma.raspadinhaCombo.findMany({
      where: { raffleId },
      select: { minimo: true, quantidade: true },
    });
    if (combos.length === 0) {
      return {
        ok: true,
        data: {
          ...vazio,
          motivo:
            "Nenhum combo cadastrado. Sem combo, nenhuma compra gera raspadinha.",
        },
      };
    }
    const menorDegrau = Math.min(...combos.map((c) => c.minimo));

    // Só as pagas, e com a contagem do que cada uma tem e do que comprou: dá
    // para decidir aqui quem precisa de conserto e chamar o serviço só nessas.
    const pagas = await prisma.reservation.findMany({
      where: { raffleId, status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: TETO_DA_CONFERENCIA + 1,
      select: {
        id: true,
        _count: {
          select: {
            raspadinhas: true,
            tickets: { where: { status: { in: ["PAID", "AWARDED"] } } },
          },
        },
      },
    });
    const faltouOlhar = Math.max(0, pagas.length - TETO_DA_CONFERENCIA);
    const olhadas = pagas.slice(0, TETO_DA_CONFERENCIA);

    let criadas = 0;
    let semCombo = 0;
    for (const reserva of olhadas) {
      const titulos = reserva._count.tickets;
      if (titulos < menorDegrau) {
        semCombo++;
        continue;
      }
      const alcancados = combos.filter((c) => titulos >= c.minimo);
      const esperado = Math.max(...alcancados.map((c) => c.quantidade));
      if (reserva._count.raspadinhas >= esperado) continue;
      criadas += await gerarRaspadinhasParaReserva(reserva.id);
    }

    if (criadas > 0) {
      await registrarLog({
        acao: "sorteio.conteudo_alterado",
        tenantId,
        alvo: { tipo: "Raffle", id: raffleId },
        detalhes: { o_que: "raspadinhas que faltavam", criadas },
      });
    }
    recarregar(raffleId);
    return {
      ok: true,
      data: {
        conferidas: olhadas.length,
        criadas,
        semCombo,
        faltouOlhar,
        motivo:
          criadas === 0 && olhadas.length > 0
            ? "Todas as compras pagas já estão com as raspadinhas certas."
            : null,
      },
    };
  } catch (err) {
    console.error("[conferirRaspadinhasAction]", err);
    return { ok: false, error: "Erro ao conferir as raspadinhas" };
  }
}
