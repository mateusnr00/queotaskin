"use server";

// Textos e imagens das páginas finais (pagamento confirmado / reserva
// expirada). Por tenant, cada admin customiza as mensagens que aparecem
// pros compradores dele. Campos vazios = volta pro texto padrão da UI.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import type { ActionResult } from "@/server/actions/auth";

const urlOrEmpty = z
  .string()
  .max(2048)
  .optional()
  .default("")
  .refine(
    (v) => !v || v.startsWith("http://") || v.startsWith("https://"),
    "URL deve começar com http:// ou https://"
  );

const messagesSchema = z.object({
  paidTitle: z.string().max(120).optional().default(""),
  paidDescription: z.string().max(500).optional().default(""),
  paidButtonLabel: z.string().max(60).optional().default(""),
  paidImageUrl: urlOrEmpty,
  expiredTitle: z.string().max(120).optional().default(""),
  expiredDescription: z.string().max(500).optional().default(""),
  expiredButtonLabel: z.string().max(60).optional().default(""),
  expiredImageUrl: urlOrEmpty,
});

export type MessagesSettingsInput = z.input<typeof messagesSchema>;

export async function updateMessagesSettingsAction(
  raw: unknown
): Promise<ActionResult> {
  const session = await getAdminOrThrow();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const parsed = messagesSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const d = parsed.data;
  // Vazio (após trim) → null no banco, pra cair no default da UI.
  const norm = (v: string) => (v.trim() ? v.trim() : null);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      paidTitle: norm(d.paidTitle),
      paidDescription: norm(d.paidDescription),
      paidButtonLabel: norm(d.paidButtonLabel),
      paidImageUrl: norm(d.paidImageUrl),
      expiredTitle: norm(d.expiredTitle),
      expiredDescription: norm(d.expiredDescription),
      expiredButtonLabel: norm(d.expiredButtonLabel),
      expiredImageUrl: norm(d.expiredImageUrl),
    },
  });

  revalidatePath("/admin/configuracoes/mensagens");
  return { ok: true, data: undefined };
}
