"use server";

// As portas do programa de afiliados.
//
// Cada uma confere quem está pedindo e delega ao serviço. Nenhuma regra de
// negócio mora aqui, e nenhuma delas aceita um affiliateId vindo do cliente:
// o afiliado é sempre derivado da sessão, senão bastaria trocar um id no
// corpo da requisição para ler (ou mexer) no programa de outra pessoa.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { DomainError } from "@/lib/errors";
import { codigoValido, normalizarCodigo } from "@/lib/afiliados";
import {
  ajustarEntradas,
  alterarCodigo,
  ativarAfiliado,
  definirConfigDeRecompensa,
  definirStatusDoAfiliado,
  vincularIndicacao,
} from "@/server/services/afiliados";
import { registrarLog } from "@/server/services/activity-log";
import type { ActionResult } from "@/server/actions/auth";

// ------------------------------------------------------------------ público

/**
 * Aplica um código de indicação numa conta que ainda não tem afiliado.
 *
 * Existe para quem criou conta antes de receber o link. Depois de vinculado,
 * não troca: a resposta diz isso em vez de fingir que deu certo.
 */
export async function aplicarCodigoDeIndicacaoAction(
  codigoBruto: unknown,
): Promise<ActionResult<{ codigo: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Entre na sua conta para usar um código." };
  }

  const parsed = z.string().trim().max(32).safeParse(codigoBruto);
  if (!parsed.success || !codigoValido(parsed.data)) {
    return { ok: false, error: "Código inválido." };
  }

  const usuario = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { referredByAffiliateId: true },
  });
  if (usuario?.referredByAffiliateId) {
    return {
      ok: false,
      error: "Sua conta já está vinculada a um afiliado, e isso não troca.",
    };
  }

  const codigo = await vincularIndicacao(session.user.id, parsed.data);
  if (!codigo) {
    // Uma mensagem só para código inexistente, autoindicação e afiliado fora
    // do ar: respostas diferentes viram um jeito de descobrir quais códigos
    // existem.
    return {
      ok: false,
      error: "Não conseguimos usar esse código. Confira e tente de novo.",
    };
  }

  revalidatePath("/minha-conta");
  return { ok: true, data: { codigo } };
}

/**
 * "Quero ser afiliado": ativação na hora, sem aprovação.
 *
 * Qualquer conta autenticada entra. O programa não dá dinheiro nem acesso a
 * dado de ninguém: dá cupom quando alguém que a pessoa trouxe paga de verdade.
 * Fila de aprovação para isso só serviria para perder quem estava disposto a
 * divulgar no minuto em que se interessou.
 *
 * Não concede cupom nenhum aqui. Cupom nasce de indicado que pagou R$ 10.
 */
export async function quereSerAfiliadoAction(): Promise<
  ActionResult<{ codigo: string }>
> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { ok: false, error: "Entre na sua conta para participar." };
    }

    const existente = await prisma.affiliate.findUnique({
      where: { userId: session.user.id },
      select: { code: true, status: true },
    });
    if (existente?.status === "SUSPENDED") {
      return {
        ok: false,
        error: "Seu programa está suspenso. Fale com o suporte.",
      };
    }

    const { code } = await ativarAfiliado(session.user.id);
    revalidatePath("/minha-conta/afiliados");
    return { ok: true, data: { codigo: code } };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("[quereSerAfiliadoAction]", err);
    return { ok: false, error: "Erro ao ativar o programa" };
  }
}

// ------------------------------------------------------------------- painel

const alvoSchema = z.object({ userId: z.string().cuid() });

export async function ativarAfiliadoAction(
  raw: unknown,
): Promise<ActionResult<{ codigo: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = alvoSchema
      .extend({ codigo: z.string().trim().max(32).optional() })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const { code } = await ativarAfiliado(
      parsed.data.userId,
      parsed.data.codigo ? normalizarCodigo(parsed.data.codigo) : undefined,
    );

    await registrarLog({
      acao: "afiliado.ativado",
      tenantId,
      alvo: { tipo: "User", id: parsed.data.userId },
      detalhes: { codigo: code },
    });

    revalidatePath("/admin/afiliados");
    return { ok: true, data: { codigo: code } };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("[ativarAfiliadoAction]", err);
    return { ok: false, error: "Erro ao ativar o afiliado" };
  }
}

export async function definirStatusDoAfiliadoAction(
  raw: unknown,
): Promise<ActionResult<undefined>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = alvoSchema
      .extend({ status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]) })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    await definirStatusDoAfiliado(parsed.data.userId, parsed.data.status);

    await registrarLog({
      acao:
        parsed.data.status === "ACTIVE"
          ? "afiliado.ativado"
          : "afiliado.suspenso",
      tenantId,
      alvo: { tipo: "User", id: parsed.data.userId },
      detalhes: { status: parsed.data.status },
    });

    revalidatePath("/admin/afiliados");
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("[definirStatusDoAfiliadoAction]", err);
    return { ok: false, error: "Erro ao mudar o status" };
  }
}

export async function alterarCodigoDoAfiliadoAction(
  raw: unknown,
): Promise<ActionResult<{ codigo: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = alvoSchema
      .extend({ codigo: z.string().trim().min(4).max(32) })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Código inválido" };

    const codigo = await alterarCodigo(parsed.data.userId, parsed.data.codigo);

    await registrarLog({
      acao: "afiliado.codigo_alterado",
      tenantId,
      alvo: { tipo: "User", id: parsed.data.userId },
      detalhes: { codigo },
    });

    revalidatePath("/admin/afiliados");
    return { ok: true, data: { codigo } };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("[alterarCodigoDoAfiliadoAction]", err);
    return { ok: false, error: "Erro ao alterar o código" };
  }
}

/**
 * Soma ou tira entradas à mão.
 *
 * Motivo obrigatório, e o responsável fica gravado no movimento: entrada vale
 * uma cota em qualquer campanha, então mexer no saldo de alguém sem deixar
 * rastro seria dar dinheiro sem nota.
 */
export async function ajustarEntradasAction(
  raw: unknown,
): Promise<ActionResult<{ aplicadas: number }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = alvoSchema
      .extend({
        quantidade: z.coerce.number().int(),
        motivo: z.string().trim().min(3).max(200),
      })
      .safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Informe a quantidade e o motivo" };
    }

    const resultado = await ajustarEntradas({
      userId: parsed.data.userId,
      quantidade: parsed.data.quantidade,
      motivo: parsed.data.motivo,
      adminId: session.user.id,
    });

    await registrarLog({
      acao: "afiliado.entradas_ajustadas",
      tenantId,
      alvo: { tipo: "User", id: parsed.data.userId },
      detalhes: {
        quantidade: resultado.aplicadas,
        motivo: parsed.data.motivo,
      },
    });

    revalidatePath("/admin/afiliados");
    return { ok: true, data: resultado };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("[ajustarEntradasAction]", err);
    return { ok: false, error: "Erro ao ajustar as entradas" };
  }
}

/**
 * Salva a configuração de recompensa de um afiliado.
 *
 * O backend é a fonte canônica: ele deriva o valor do cupom do limiar e da
 * porcentagem, e recusa se o que a tela mandou não bater. Não mexe em cupom
 * já concedido nem no progresso; a mudança vale daqui para a frente, e o
 * de-para fica no histórico com o nome de quem mudou.
 */
export async function definirConfigDeRecompensaAction(
  raw: unknown,
): Promise<ActionResult<{ valorDoCupomEmCentavos: number }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = alvoSchema
      .extend({
        usaConfigPropria: z.boolean(),
        modo: z.enum(["VALOR_FIXO", "PERCENTUAL_PROGRESSIVO"]),
        limiarEmCentavos: z.coerce.number().int(),
        recompensaEmBps: z.coerce.number().int(),
        valorDoCupomEmCentavos: z.coerce.number().int(),
        degrauEmCentavos: z.coerce.number().int(),
        bpsPorDegrau: z.coerce.number().int(),
      })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const config = await definirConfigDeRecompensa({
      userId: parsed.data.userId,
      usaConfigPropria: parsed.data.usaConfigPropria,
      modo: parsed.data.modo,
      limiarEmCentavos: parsed.data.limiarEmCentavos,
      recompensaEmBps: parsed.data.recompensaEmBps,
      valorDoCupomEmCentavos: parsed.data.valorDoCupomEmCentavos,
      degrauEmCentavos: parsed.data.degrauEmCentavos,
      bpsPorDegrau: parsed.data.bpsPorDegrau,
      adminId: session.user.id,
    });

    await registrarLog({
      acao: "afiliado.recompensa_alterada",
      tenantId,
      alvo: { tipo: "User", id: parsed.data.userId },
      detalhes: {
        personalizada: parsed.data.usaConfigPropria,
        modo: config.modo,
        limiar: config.limiarEmCentavos,
        bps: config.recompensaEmBps,
        cupom: config.valorDoCupomEmCentavos,
        degrau: config.degrauEmCentavos,
        bpsPorDegrau: config.bpsPorDegrau,
      },
    });

    revalidatePath("/admin/afiliados");
    return {
      ok: true,
      data: { valorDoCupomEmCentavos: config.valorDoCupomEmCentavos },
    };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error("[definirConfigDeRecompensaAction]", err);
    return { ok: false, error: "Erro ao salvar a configuração" };
  }
}
