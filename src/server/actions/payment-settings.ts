"use server";

// Configurações de pagamento por tenant, escolha de gateway (SyncPay /
// CodePay) e credenciais. Secrets são encriptados antes de gravar (AES-256-GCM
// via PAYMENT_SECRET_ENCRYPTION_KEY).
//
// O admin nunca vê o secret de volta. Quando edita, o campo aparece vazio com
// placeholder "•••• já configurado". Enviar vazio = "manter o que está lá";
// enviar texto novo = sobrescreve.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { registrarLog } from "@/server/services/activity-log";
import type { ActionResult } from "@/server/actions/auth";

const paymentSettingsSchema = z.object({
  provider: z.enum(["SYNCPAY", "CODEPAY"]),
  syncpayClientId: z.string().max(200).optional().default(""),
  // Vazio = manter atual; com valor = sobrescrever.
  syncpayClientSecret: z.string().max(500).optional().default(""),
  syncpayBaseUrl: z
    .string()
    .max(300)
    .optional()
    .default("")
    .refine(
      (v) => !v || v.startsWith("http://") || v.startsWith("https://"),
      "URL deve começar com http:// ou https://"
    ),
  codepayClientId: z.string().max(200).optional().default(""),
  codepayPassword: z.string().max(500).optional().default(""),
});

export type PaymentSettingsInput = z.input<typeof paymentSettingsSchema>;

export async function updatePaymentSettingsAction(
  raw: unknown
): Promise<ActionResult> {
  const session = await getAdminOrThrow();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const parsed = paymentSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const data = parsed.data;

  // Pra salvar qualquer secret novo, a env key precisa estar definida.
  // Sem ela, deixa o admin editar o resto mas bloqueia a parte de secret.
  const wantsSecretWrite =
    data.syncpayClientSecret.length > 0 || data.codepayPassword.length > 0;
  if (wantsSecretWrite && !isEncryptionConfigured()) {
    return {
      ok: false,
      error:
        "PAYMENT_SECRET_ENCRYPTION_KEY não definida no Vercel. Impossível gravar credenciais com segurança.",
    };
  }

  // Validação cruzada: se escolheu CodePay, precisa ter clientId. Se não
  // tem password salva e nem está enviando uma, bloqueia.
  if (data.provider === "CODEPAY" && !data.codepayClientId) {
    return {
      ok: false,
      error: "Selecione CodePay exige preencher o Integration ID.",
      fieldErrors: { codepayClientId: ["Obrigatório quando provider = CodePay"] },
    };
  }

  // Monta update, só inclui secret se veio valor.
  const update: Record<string, unknown> = {
    paymentProvider: data.provider,
    syncpayClientId: data.syncpayClientId || null,
    syncpayBaseUrl: data.syncpayBaseUrl || null,
    codepayClientId: data.codepayClientId || null,
  };

  if (data.syncpayClientSecret) {
    update.syncpayClientSecretEnc = encryptSecret(data.syncpayClientSecret);
  } else if (!data.syncpayClientId) {
    // Limpou o clientId → limpa também o secret pra não ficar órfão.
    update.syncpayClientSecretEnc = null;
  }
  if (data.codepayPassword) {
    update.codepayPasswordEnc = encryptSecret(data.codepayPassword);
  } else if (!data.codepayClientId) {
    update.codepayPasswordEnc = null;
  }

  // Última validação: o provider escolhido precisa ter credenciais
  // efetivamente disponíveis. Pra CodePay, ou veio password agora ou já
  // tem encriptada salva.
  if (data.provider === "CODEPAY" && !data.codepayPassword) {
    const existing = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { codepayPasswordEnc: true },
    });
    if (!existing?.codepayPasswordEnc) {
      return {
        ok: false,
        error: "CodePay exige a SecretKey. Preencha o campo.",
        fieldErrors: { codepayPassword: ["Obrigatório no primeiro cadastro"] },
      };
    }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: update,
  });

  // Só os NOMES dos campos submetidos. O valor é credencial de gateway, e um
  // log que guarda a credencial que ele deveria proteger vira outro alvo. A
  // sanitização em registrarLog também barraria pelo nome da chave, mas não
  // custa nada não mandar.
  await registrarLog({
    acao: "config.pagamento_alterada",
    tenantId,
    alvo: { tipo: "Tenant", id: tenantId },
    detalhes: { camposAlterados: Object.keys(parsed.data) },
  });

  revalidatePath("/admin/configuracoes/pagamentos");
  return { ok: true, data: undefined };
}
