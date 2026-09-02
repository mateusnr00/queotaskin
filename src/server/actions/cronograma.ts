"use server";

// As ações do cronograma no painel.
//
// Camada fina de propósito: cada uma confere quem está chamando, resolve o
// painel ativo, delega para o serviço e revalida as telas. Nenhuma regra de
// fila mora aqui. Regra de fila em action é como nasce a segunda versão da
// regra, e com ela o dia em que o painel e o cron discordam sobre quem é o
// próximo sorteio.
//
// Toda action passa por `getAdminOrThrow` (que também barra admin com senha
// temporária) e por `getActiveTenantIdForAdmin`, que é o que impede um admin
// de mexer na fila de outro painel.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import {
  adotarComoAtivo,
  ativarProximo,
  tentarNovamente,
  definirAtraso,
  definirAutomacao,
  devolverParaFila,
  enfileirar,
  pularItem,
  removerDaFila,
  reordenarFila,
} from "@/server/services/cronograma";
import type { ActionResult } from "@/server/actions/auth";

/** As telas que mudam quando a fila muda. */
function revalidarTudo() {
  revalidatePath("/admin/sorteios/cronograma");
  revalidatePath("/admin/sorteios");
  revalidatePath("/admin");
  // O site: ativar uma campanha muda a home e a lista. As páginas públicas são
  // dinâmicas (o tenant sai do Host a cada requisição), então isto é cinto de
  // segurança, não o mecanismo: quem entrar no site depois da ativação já vê a
  // campanha nova sem depender desta linha.
  revalidatePath("/");
  revalidatePath("/sorteios");
  revalidatePath("/[slug]", "page");
}

const itemSchema = z.object({ itemId: z.string().cuid() });

export async function enfileirarAction(raw: unknown): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = z
      .object({
        raffleId: z.string().cuid(),
        /** "2026-09-02". Só rótulo de organização do painel. */
        dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const resultado = await enfileirar({
      tenantId,
      raffleId: parsed.data.raffleId,
      dia: parsed.data.dia ? new Date(`${parsed.data.dia}T12:00:00.000Z`) : null,
      adminId: session.user.id,
    });
    if (!resultado.ok) return { ok: false, error: resultado.erros.join(" ") };

    revalidarTudo();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[enfileirarAction]", err);
    return { ok: false, error: "Erro ao colocar na fila" };
  }
}

export async function adotarAtivoAction(raw: unknown): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = z.object({ raffleId: z.string().cuid() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const resultado = await adotarComoAtivo({
      tenantId,
      raffleId: parsed.data.raffleId,
      adminId: session.user.id,
    });
    if (!resultado.ok) return { ok: false, error: resultado.erro };

    revalidarTudo();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[adotarAtivoAction]", err);
    return { ok: false, error: "Erro ao adotar a campanha" };
  }
}

export async function removerDoCronogramaAction(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const r = await removerDaFila({ tenantId, itemId: parsed.data.itemId });
    if (!r.ok) return { ok: false, error: r.erro ?? "Não foi possível remover" };

    revalidarTudo();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[removerDoCronogramaAction]", err);
    return { ok: false, error: "Erro ao remover da fila" };
  }
}

export async function pularItemAction(raw: unknown): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const r = await pularItem({ tenantId, itemId: parsed.data.itemId });
    if (!r.ok) return { ok: false, error: r.erro ?? "Não foi possível pular" };

    revalidarTudo();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[pularItemAction]", err);
    return { ok: false, error: "Erro ao pular" };
  }
}

export async function devolverParaFilaAction(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const r = await devolverParaFila({ tenantId, itemId: parsed.data.itemId });
    if (!r.ok) return { ok: false, error: r.erro ?? "Não foi possível devolver" };

    revalidarTudo();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[devolverParaFilaAction]", err);
    return { ok: false, error: "Erro ao devolver para a fila" };
  }
}

export async function reordenarFilaAction(raw: unknown): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = z
      .object({ ids: z.array(z.string().cuid()).max(200) })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const r = await reordenarFila({ tenantId, idsNaOrdem: parsed.data.ids });
    if (!r.ok) return { ok: false, error: r.erro ?? "Não foi possível reordenar" };

    revalidarTudo();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[reordenarFilaAction]", err);
    return { ok: false, error: "Erro ao salvar a ordem" };
  }
}

export async function alternarAutomacaoAction(
  raw: unknown,
): Promise<ActionResult<{ ativou: string | null }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = z
      .object({
        ativa: z.boolean(),
        /**
         * Retomar com a fila parada e ninguém no ar deixa o site sem campanha
         * até alguém agir. Quando o painel confirma, a mesma ação já ativa o
         * próximo, e devolve qual foi para a tela poder dizer.
         */
        ativarProximoAgora: z.boolean().optional(),
      })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    await definirAutomacao({ tenantId, ativa: parsed.data.ativa });

    let ativou: string | null = null;
    if (parsed.data.ativa && parsed.data.ativarProximoAgora) {
      const r = await ativarProximo({ tenantId, origem: "MANUAL" });
      if (r.ok) ativou = r.titulo;
      else if (r.motivo === "ERRO") {
        return { ok: false, error: "Automação retomada, mas a ativação falhou." };
      }
    }

    revalidarTudo();
    return { ok: true, data: { ativou } };
  } catch (err) {
    console.error("[alternarAutomacaoAction]", err);
    return { ok: false, error: "Erro ao mudar a automação" };
  }
}

export async function definirAtrasoAction(raw: unknown): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = z
      .object({ segundos: z.number().int().min(0).max(3600) })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    await definirAtraso({ tenantId, segundos: parsed.data.segundos });
    revalidarTudo();
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[definirAtrasoAction]", err);
    return { ok: false, error: "Erro ao salvar o intervalo" };
  }
}

/**
 * O botão "tentar novamente" do aviso de erro.
 *
 * Devolve o item travado para a fila e tenta subir ELE, no lugar em que
 * estava. Se falhar de novo, ele trava de novo, e o aviso continua.
 */
export async function tentarNovamenteAction(
  raw: unknown,
): Promise<ActionResult<{ titulo: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = z.object({ itemId: z.string().cuid() }).safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const r = await tentarNovamente({ tenantId, itemId: parsed.data.itemId });
    if (!r.ok) {
      return {
        ok: false,
        error: r.detalhe ?? "Não foi possível ativar. O item segue travado.",
      };
    }
    revalidarTudo();
    return { ok: true, data: { titulo: r.titulo } };
  } catch (err) {
    console.error("[tentarNovamenteAction]", err);
    return { ok: false, error: "Erro ao tentar de novo" };
  }
}

/**
 * Ativação pelo painel.
 *
 * Passa pelo mesmo caminho da automática, com as mesmas travas: a única
 * diferença é que ela ignora a pausa (quem clicou sabe que está pausado) e
 * grava "MANUAL" no item.
 */
export async function ativarAgoraAction(
  raw: unknown,
): Promise<ActionResult<{ titulo: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = z
      .object({ itemId: z.string().cuid().optional() })
      .safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const r = await ativarProximo({
      tenantId,
      origem: "MANUAL",
      itemId: parsed.data.itemId,
    });
    if (!r.ok) {
      const mensagens: Record<string, string> = {
        FILA_BLOQUEADA:
          "A fila está travada por uma falha. Resolva o aviso antes de continuar.",
        JA_TEM_ATIVO:
          "Já existe uma campanha no ar por esta fila. Espere o sorteio dela terminar.",
        FILA_VAZIA: "A fila está vazia.",
        ITEM_FORA_DA_FILA: "Este item não está mais aguardando.",
        CAMPANHA_MUDOU: r.detalhe ?? "A campanha mudou de situação.",
        CORRIDA: "Outra ativação aconteceu ao mesmo tempo. Recarregue.",
        AUTOMACAO_PAUSADA: "A automação está pausada.",
        SEM_FILA: "Cronograma não encontrado.",
        ERRO: "Não foi possível ativar o próximo sorteio.",
      };
      return { ok: false, error: mensagens[r.motivo] ?? "Não foi possível ativar" };
    }

    revalidarTudo();
    return { ok: true, data: { titulo: r.titulo } };
  } catch (err) {
    console.error("[ativarAgoraAction]", err);
    return { ok: false, error: "Erro ao ativar" };
  }
}
