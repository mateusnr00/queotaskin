"use server";

// O preço da skin para o painel sugerir o valor da cota.
//
// Camada fina: confere quem chama, resolve o painel ativo e delega. A regra
// (cache, Steam, catálogo de reserva, gravação e log) mora no serviço, porque
// agora ela tem dois chamadores: a criação, que conhece o id do item do
// catálogo, e a edição, que só conhece o nome do prêmio.
//
// A consulta é sempre daqui, nunca do navegador: a Steam limita por IP, e o
// que precisa ser raro é a mesma skin ser consultada de novo a cada abertura
// de tela. O cache no banco resolve isso.

import { z } from "zod";
import { SkinWear } from "@prisma/client";

import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import {
  precoSugeridoDaSkin,
  precoSugeridoPeloNome,
  type PrecoSugerido,
} from "@/server/services/preco-de-skin";

export type PrecoDaSkinResultado = PrecoSugerido;

const porId = z.object({
  skinTemplateId: z.string().cuid(),
  wear: z.nativeEnum(SkinWear).nullable().optional(),
  /** Ignora o cache. É o botão "buscar de novo" do painel. */
  forcar: z.boolean().optional(),
});

export async function precoDaSkinAction(
  raw: unknown,
): Promise<PrecoDaSkinResultado> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = porId.safeParse(raw);
    if (!parsed.success) return { ok: false, erro: "Dados inválidos" };

    return await precoSugeridoDaSkin({
      skinTemplateId: parsed.data.skinTemplateId,
      tenantId,
      wear: parsed.data.wear ?? null,
      forcar: parsed.data.forcar,
    });
  } catch (err) {
    console.error("[precoDaSkinAction]", err);
    return { ok: false, erro: "Erro ao consultar o preço" };
  }
}

const porNome = z.object({
  nome: z.string().min(1).max(200),
  wear: z.nativeEnum(SkinWear).nullable().optional(),
  forcar: z.boolean().optional(),
});

/**
 * A mesma consulta, a partir do nome do prêmio.
 *
 * É o caminho da edição do sorteio: lá existe o prêmio com a ficha da skin,
 * mas não o id do item do catálogo.
 */
export async function precoDaSkinPeloNomeAction(
  raw: unknown,
): Promise<PrecoDaSkinResultado> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = porNome.safeParse(raw);
    if (!parsed.success) return { ok: false, erro: "Dados inválidos" };

    return await precoSugeridoPeloNome({
      nome: parsed.data.nome,
      tenantId,
      wear: parsed.data.wear ?? null,
      forcar: parsed.data.forcar,
    });
  } catch (err) {
    console.error("[precoDaSkinPeloNomeAction]", err);
    return { ok: false, erro: "Erro ao consultar o preço" };
  }
}
