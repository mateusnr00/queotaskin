"use server";

// Textos e imagens das páginas finais (pagamento confirmado / reserva
// expirada). Por tenant, cada admin customiza as mensagens que aparecem
// pros compradores dele. Campos vazios = volta pro texto padrão da UI.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { registrarLog } from "@/server/services/activity-log";
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
  // Selo automático do card, por faixa de vendas.
  earlyText: z.string().max(60).optional().default(""),
  halfwayText: z.string().max(60).optional().default(""),
  almostGoneText: z.string().max(60).optional().default(""),
  soldOutText: z.string().max(60).optional().default(""),
  // 1 a 99: em 0 o selo entraria com a campanha vazia, e em 100 nunca
  // entraria, porque ali quem manda é o de esgotado.
  halfwayPercent: z.coerce.number().int().min(1).max(99).default(50),
  almostGonePercent: z.coerce.number().int().min(1).max(99).default(80),
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
      earlyText: norm(d.earlyText),
      halfwayText: norm(d.halfwayText),
      almostGoneText: norm(d.almostGoneText),
      soldOutText: norm(d.soldOutText),
      // O menor não pode passar do maior: com 80 e 50 invertidos, a faixa de
      // "perto do fim" nunca seria alcançada e o selo pularia direto para
      // esgotado.
      halfwayPercent: Math.min(d.halfwayPercent, d.almostGonePercent),
      almostGonePercent: Math.max(d.halfwayPercent, d.almostGonePercent),
    },
  });

  // Só os nomes dos campos do schema, mesma regra de payment-settings: o
  // conteúdo aqui é texto de UI (não é credencial), mas o padrão de
  // "camposAlterados" fica consistente entre as duas telas de configuração.
  await registrarLog({
    acao: "config.mensagens_alterada",
    tenantId,
    alvo: { tipo: "Tenant", id: tenantId },
    detalhes: { camposAlterados: Object.keys(parsed.data) },
  });

  revalidatePath("/admin/configuracoes/mensagens");
  return { ok: true, data: undefined };
}
