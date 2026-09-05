"use server";

// Aviso/promoção em imagem (pop-up estilo restaurante). A IMAGEM em si é subida
// por uploadLogoAction(slot="aviso"), que grava avisoImagemUrl. Aqui ficam os
// campos que acompanham a arte: ligar/desligar, a proporção (5:3 ou 9:16) e o
// link opcional para onde a imagem leva ao ser clicada. Por tenant.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { deleteRaffleImage, pathFromPublicUrl } from "@/lib/storage";
import { registrarLog } from "@/server/services/activity-log";
import type { ActionResult } from "@/server/actions/auth";

const linkOpcional = z
  .string()
  .max(2048)
  .optional()
  .default("")
  .refine(
    (v) => !v || v.startsWith("http://") || v.startsWith("https://"),
    "O link deve começar com http:// ou https://"
  );

const avisoSchema = z.object({
  avisoAtivo: z.coerce.boolean().default(false),
  avisoAspecto: z.enum(["5:3", "9:16"]).default("5:3"),
  avisoLinkUrl: linkOpcional,
});

export type AvisoSettingsInput = z.input<typeof avisoSchema>;

/// Salva os campos do aviso (sem a imagem, que é do upload). Campo de link
/// vazio vira null. Revalida o site público para o pop-up refletir na hora.
export async function salvarAvisoAction(raw: unknown): Promise<ActionResult> {
  const session = await getAdminOrThrow();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const parsed = avisoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { avisoAtivo, avisoAspecto, avisoLinkUrl } = parsed.data;

  // Ligar o aviso sem imagem não mostra nada: avisa em vez de gravar um estado
  // que promete um pop-up e não entrega.
  if (avisoAtivo) {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { avisoImagemUrl: true },
    });
    if (!t?.avisoImagemUrl) {
      return { ok: false, error: "Envie a imagem do aviso antes de ativar." };
    }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      avisoAtivo,
      avisoAspecto,
      avisoLinkUrl: avisoLinkUrl || null,
    },
  });

  await registrarLog({
    acao: "config.site_alterada",
    tenantId,
    alvo: { tipo: "Tenant", id: tenantId },
    detalhes: { o_que: "aviso", ativo: avisoAtivo },
  });

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/// Remove a imagem do aviso (best-effort no Storage) e desliga o aviso, porque
/// aviso ligado sem imagem não mostra nada.
export async function removerImagemDoAvisoAction(): Promise<ActionResult> {
  const session = await getAdminOrThrow();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { avisoImagemUrl: true },
  });
  if (t?.avisoImagemUrl) {
    const path = pathFromPublicUrl(t.avisoImagemUrl);
    if (path) await deleteRaffleImage(path).catch(() => null);
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { avisoImagemUrl: null, avisoAtivo: false },
  });

  await registrarLog({
    acao: "config.site_alterada",
    tenantId,
    alvo: { tipo: "Tenant", id: tenantId },
    detalhes: { o_que: "aviso", removida: true },
  });

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
