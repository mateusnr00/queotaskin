"use server";

// Busca o preço de uma skin na Steam, para o painel sugerir o preço do número.
//
// A consulta é sempre daqui, nunca do navegador: a chave é que a Steam limita
// por IP, e mil admins consultando de mil IPs diferentes não é o problema, o
// problema é a mesma skin ser consultada de novo a cada vez que alguém abre a
// tela de criar sorteio. O cache no banco resolve isso, e é ele que mantém as
// chamadas raras o bastante para não levar 429.

import { z } from "zod";
import { SkinWear } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import {
  buscarPrecoNaSteam,
  SteamLimitouError,
} from "@/lib/steam-market";

/**
 * Por quanto tempo um preço guardado ainda serve.
 *
 * Skin não é ação de bolsa: o preço se move em dias, não em minutos. Meio dia
 * deixa o número atual sem transformar cada abertura da tela numa consulta.
 */
const VALIDADE_HORAS = 12;

const entrada = z.object({
  skinTemplateId: z.string().cuid(),
  wear: z.nativeEnum(SkinWear).nullable().optional(),
  /** Ignora o cache. É o botão "atualizar agora" do painel. */
  forcar: z.boolean().optional(),
});

export type PrecoDaSkinResultado =
  | {
      ok: true;
      brl: number;
      buscadoEm: string;
      volume: number | null;
      /** True quando veio do banco, sem bater na Steam. */
      doCache: boolean;
    }
  | { ok: false; erro: string; semPreco?: boolean };

export async function precoDaSkinAction(
  raw: unknown,
): Promise<PrecoDaSkinResultado> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = entrada.safeParse(raw);
    if (!parsed.success) return { ok: false, erro: "Dados inválidos" };
    const { skinTemplateId, forcar } = parsed.data;
    const wear = parsed.data.wear ?? null;

    // O tenant entra na busca de propósito: sem ele, um admin poderia sondar
    // o catálogo de outro tenant passando um id qualquer.
    const skin = await prisma.skinTemplate.findFirst({
      where: { id: skinTemplateId, tenantId },
      select: {
        id: true,
        name: true,
        skinStatTrak: true,
        skinSouvenir: true,
      },
    });
    if (!skin) return { ok: false, erro: "Skin não encontrada" };

    if (!forcar) {
      const guardado = await prisma.skinPreco.findFirst({
        where: { skinTemplateId, wear },
        select: { brl: true, buscadoEm: true, volume: true },
      });
      const limite = Date.now() - VALIDADE_HORAS * 3_600_000;
      if (guardado && guardado.buscadoEm.getTime() > limite) {
        return {
          ok: true,
          brl: Number(guardado.brl),
          buscadoEm: guardado.buscadoEm.toISOString(),
          volume: guardado.volume,
          doCache: true,
        };
      }
    }

    const achado = await buscarPrecoNaSteam(skin, wear);
    if (!achado) {
      return {
        ok: false,
        semPreco: true,
        erro: "A Steam não tem anúncio desta skin neste desgaste agora.",
      };
    }

    const agora = new Date();
    // upsert por (skin, wear) não dá com wear nulo, porque o índice único
    // dele é parcial: o Prisma não enxerga isso como chave. Daí o par
    // deleteMany + create, dentro da mesma transação.
    await prisma.$transaction([
      prisma.skinPreco.deleteMany({ where: { skinTemplateId, wear } }),
      prisma.skinPreco.create({
        data: {
          skinTemplateId,
          wear,
          brl: achado.brl,
          nomeConsultado: achado.nomeConsultado,
          volume: achado.volume,
          buscadoEm: agora,
        },
      }),
    ]);

    return {
      ok: true,
      brl: achado.brl,
      buscadoEm: agora.toISOString(),
      volume: achado.volume,
      doCache: false,
    };
  } catch (err) {
    if (err instanceof SteamLimitouError) {
      return { ok: false, erro: err.message };
    }
    console.error("[precoDaSkinAction]", err);
    return {
      ok: false,
      erro: "Não foi possível falar com a Steam agora. Tente de novo em instantes.",
    };
  }
}
