"use server";

// A atualização de preços do catálogo, pedida pelo painel.
//
// Camada fina: confere quem chama, resolve o painel ativo e delega. A regra
// (baixar o despejo, converter o dólar, casar com o catálogo e gravar) mora no
// serviço.

import { revalidatePath } from "next/cache";

import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { registrarLog } from "@/server/services/activity-log";
import { sincronizarPrecosDoCatalogo } from "@/server/services/sincronizar-precos";
import type { ActionResult } from "@/server/actions/auth";

export async function atualizarPrecosDoCatalogoAction(): Promise<
  ActionResult<{
    skinsComPreco: number;
    atualizados: number;
    dolar: number;
    fonte: string;
  }>
> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const r = await sincronizarPrecosDoCatalogo({ tenantId });
    if (!r.ok) return { ok: false, error: r.erro };

    await registrarLog({
      acao: "skin.alterada",
      tenantId,
      detalhes: {
        o_que: "preços do catálogo",
        skins: r.skinsComPreco,
        desgastes: r.atualizados,
        itensNoDespejo: r.itensNoDespejo,
        fonte: r.fonte,
        dolar: r.dolar,
        fonteDoDolar: r.fonteDoDolar,
      },
    });

    revalidatePath("/admin/skins");
    return {
      ok: true,
      data: {
        skinsComPreco: r.skinsComPreco,
        atualizados: r.atualizados,
        dolar: r.dolar,
        fonte: r.fonte,
      },
    };
  } catch (err) {
    console.error("[atualizarPrecosDoCatalogoAction]", err);
    return { ok: false, error: "Erro ao atualizar os preços" };
  }
}
