"use server";

// A configuração da Caixa de Level Up, no painel.
//
// A VALIDAÇÃO É DE SERVIDOR, E RECUSA EM VEZ DE CORRIGIR.
//
// Uma tabela de drops que soma 98% não é salva. Salvar e "distribuir o resto"
// transformaria um erro de digitação numa regra secreta de economia, que
// ninguém escreveu e ninguém consegue explicar depois.
//
// LIGAR MARCA A DATA
//
// `levelUpBoxesEnabledAt` recebe o instante em que o recurso é ligado, e é
// ela que impede caixa retroativa: só ganha quem sobe de nível depois disso.
// Religar não reescreve a data original, porque quem já ganhou caixa não pode
// ganhar de novo pelos mesmos níveis.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LevelUpBoxRarity } from "@prisma/client";

import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { registrarLog } from "@/server/services/activity-log";
import { conferirDrops, DROPS_PADRAO } from "@/lib/xp/caixa-de-level-up";
import type { ActionResult } from "@/server/actions/auth";

const dropSchema = z.object({
  multiplier: z.coerce.number().min(1.01).max(99.99),
  rarity: z.nativeEnum(LevelUpBoxRarity),
  chance: z.coerce.number().int().min(0).max(100),
  ativo: z.coerce.boolean(),
});

const entrada = z.object({
  ligado: z.coerce.boolean(),
  minutos: z.coerce.number().int().min(1).max(1440),
  drops: z.array(dropSchema).min(1).max(30),
});

export async function salvarConfigDaCaixaAction(
  raw: unknown,
): Promise<ActionResult<{ drops: number }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = entrada.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Confira os campos: há valor fora do permitido." };
    }
    const { ligado, minutos, drops } = parsed.data;

    // A régua é a mesma do sorteio: se não fecha em 100, não salva.
    const conferencia = conferirDrops(
      drops.filter((d) => d.ativo).map((d) => ({ ...d, chance: d.chance })),
    );
    if (!conferencia.ok) return { ok: false, error: conferencia.erro };

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { levelUpBoxesEnabled: true, levelUpBoxesEnabledAt: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          levelUpBoxesEnabled: ligado,
          levelUpBoostMinutes: minutos,
          // A data só é escrita na PRIMEIRA vez que liga. Reescrever num
          // religamento faria o marco de "nada retroativo" andar para a
          // frente e apagaria a referência de quando o recurso estreou.
          ...(ligado && !tenant.levelUpBoxesEnabledAt
            ? { levelUpBoxesEnabledAt: new Date() }
            : {}),
        },
      });

      // Substitui a tabela inteira: é uma configuração, não um histórico.
      await tx.levelUpBoxDrop.deleteMany({ where: { tenantId } });
      await tx.levelUpBoxDrop.createMany({
        data: drops.map((d, i) => ({
          tenantId,
          multiplier: d.multiplier,
          rarity: d.rarity,
          chance: d.chance,
          ativo: d.ativo,
          ordem: i,
        })),
      });
    });

    await registrarLog({
      acao: "config.site_alterada",
      tenantId,
      detalhes: {
        o_que: "caixa de level up",
        ligado,
        minutos,
        drops: drops.length,
        ativos: drops.filter((d) => d.ativo).length,
      },
    });

    revalidatePath("/admin/ranking");
    return { ok: true, data: { drops: drops.length } };
  } catch (err) {
    console.error("[salvarConfigDaCaixaAction]", err);
    return { ok: false, error: "Erro ao salvar a configuração" };
  }
}

/** Repõe a tabela de fábrica, para quem se perdeu mexendo. */
export async function restaurarDropsPadraoAction(): Promise<
  ActionResult<{ drops: number }>
> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    await prisma.$transaction(async (tx) => {
      await tx.levelUpBoxDrop.deleteMany({ where: { tenantId } });
      await tx.levelUpBoxDrop.createMany({
        data: DROPS_PADRAO.map((d, i) => ({
          tenantId,
          multiplier: d.multiplier,
          rarity: d.rarity,
          chance: d.chance,
          ativo: true,
          ordem: i,
        })),
      });
    });

    revalidatePath("/admin/ranking");
    return { ok: true, data: { drops: DROPS_PADRAO.length } };
  } catch (err) {
    console.error("[restaurarDropsPadraoAction]", err);
    return { ok: false, error: "Erro ao restaurar a tabela" };
  }
}
