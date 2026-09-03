"use server";

// A régua de XP do painel: quantos XP cada real pago credita.
//
// UMA RÉGUA SÓ, PARA O CRÉDITO E PARA A TELA.
//
// Este valor alimenta o crédito de XP de uma compra E a barra que diz
// "faltam R$ X para o próximo nível". Ele já existia na coluna e já aparecia
// no painel, mas não havia por onde editá-lo, e o crédito usava uma constante
// própria: a tela prometia numa régua e o extrato pagava noutra.
//
// A VALIDAÇÃO É DE SERVIDOR, PORQUE O NAVEGADOR NÃO É TESTEMUNHA.
//
// O que chega numa action é o que o cliente mandou, não o que o formulário
// mostrou. Régua zerada faria toda compra render zero; negativa, XP negativo;
// fracionária, XP quebrado numa coluna de inteiro. E o teto existe porque a
// escada de níveis é tabela fixa em XP: com mil XP por real alguém chegaria
// ao nível 21 gastando R$ 300, e nada no sistema reclamaria.
//
// O QUE JÁ FOI CREDITADO NÃO MUDA.
//
// Mudar a régua vale para crédito novo. Cada `XpEntry` guarda em `metadata`
// a régua com que foi calculado, então a compra de ontem continua explicável
// depois que a de hoje passa a valer outra coisa.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { registrarLog } from "@/server/services/activity-log";
import { MAX_XP_PER_BRL } from "@/lib/xp/config";
import type { ActionResult } from "@/server/actions/auth";

const entrada = z.object({
  // `int()` recusa 10.5 em vez de arredondar: a coluna é inteira, e arredondar
  // calado gravaria uma régua que ninguém escolheu.
  xpPerBrl: z.coerce.number().int().min(1).max(MAX_XP_PER_BRL),
});

export async function salvarReguaDeXpAction(
  raw: unknown,
): Promise<ActionResult<{ xpPerBrl: number }>> {
  try {
    // Admin, e o painel ATIVO dele: sem isto, um id de tenant no payload
    // deixaria alguém mexer na economia de outro painel.
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = entrada.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: `A régua precisa ser um número inteiro entre 1 e ${MAX_XP_PER_BRL} XP por real.`,
      };
    }
    const { xpPerBrl } = parsed.data;

    const antes = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { xpPerBrl: true },
    });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { xpPerBrl },
    });

    await registrarLog({
      acao: "config.site_alterada",
      tenantId,
      detalhes: { o_que: "régua de XP", de: antes.xpPerBrl, para: xpPerBrl },
    });

    revalidatePath("/admin/ranking");
    return { ok: true, data: { xpPerBrl } };
  } catch {
    return { ok: false, error: "Não foi possível salvar a régua de XP." };
  }
}
