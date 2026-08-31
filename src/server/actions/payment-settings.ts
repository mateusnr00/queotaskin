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
  provider: z.enum(["SYNCPAY", "CODEPAY", "SIGILOPAY", "NEXUSPAG"]),
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
  sigilopayClientId: z.string().max(200).optional().default(""),
  sigilopayClientSecret: z.string().max(500).optional().default(""),
  nexuspagApiKey: z.string().max(500).optional().default(""),
  nexuspagWebhookSecret: z.string().max(500).optional().default(""),
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
    data.syncpayClientSecret.length > 0 ||
    data.codepayPassword.length > 0 ||
    data.sigilopayClientSecret.length > 0 ||
    data.nexuspagApiKey.length > 0 ||
    data.nexuspagWebhookSecret.length > 0;
  if (wantsSecretWrite && !isEncryptionConfigured()) {
    return {
      ok: false,
      error:
        "PAYMENT_SECRET_ENCRYPTION_KEY não definida no Vercel. Impossível gravar credenciais com segurança.",
    };
  }

  if (data.provider === "SIGILOPAY" && !data.sigilopayClientId) {
    return {
      ok: false,
      error: "Selecionar SigiloPay exige preencher a Chave Pública.",
      fieldErrors: {
        sigilopayClientId: ["Obrigatório quando o gateway é SigiloPay"],
      },
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
    sigilopayClientId: data.sigilopayClientId || null,
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
  if (data.nexuspagApiKey) {
    update.nexuspagApiKeyEnc = encryptSecret(data.nexuspagApiKey);
  }
  if (data.nexuspagWebhookSecret) {
    update.nexuspagWebhookSecretEnc = encryptSecret(data.nexuspagWebhookSecret);
  }
  if (data.sigilopayClientSecret) {
    update.sigilopayClientSecretEnc = encryptSecret(data.sigilopayClientSecret);
  } else if (!data.sigilopayClientId) {
    // Limpou a chave pública: limpa a privada junto, para não sobrar secret
    // órfão de uma integração que já saiu.
    update.sigilopayClientSecretEnc = null;
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

  if (data.provider === "SIGILOPAY" && !data.sigilopayClientSecret) {
    const atual = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { sigilopayClientSecretEnc: true },
    });
    if (!atual?.sigilopayClientSecretEnc) {
      return {
        ok: false,
        error: "SigiloPay exige a Chave Privada. Preencha o campo.",
        fieldErrors: {
          sigilopayClientSecret: ["Obrigatório no primeiro cadastro"],
        },
      };
    }
  }

  if (data.provider === "NEXUSPAG" && !data.nexuspagApiKey) {
    const atual = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nexuspagApiKeyEnc: true },
    });
    if (!atual?.nexuspagApiKeyEnc) {
      return {
        ok: false,
        error: "NexusPag exige a chave de API. Preencha o campo.",
        fieldErrors: { nexuspagApiKey: ["Obrigatório no primeiro cadastro"] },
      };
    }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: update,
  });

  // Os NOMES dos campos, nunca os valores: são credenciais de gateway, e
  // um log que guarda a credencial que deveria proteger vira outro alvo.
  //
  // "Enviados", não "alterados", e a diferença é honestidade: os
  // .default() do Zod preenchem o que o formulário não mandou, então a
  // lista é sempre o schema inteiro. Um diff de verdade também não
  // resolveria, porque o valor guardado é cifrado e a cifra faz qualquer
  // comparação acusar mudança em todo salvamento.
  await registrarLog({
    acao: "config.pagamento_alterada",
    tenantId,
    alvo: { tipo: "Tenant", id: tenantId },
    detalhes: { camposEnviados: Object.keys(parsed.data) },
  });

  revalidatePath("/admin/configuracoes/pagamentos");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// TAXAS DO GATEWAY
// ---------------------------------------------------------------------------

const faixaSchema = z.object({
  /** A partir de qual valor de compra, em reais. */
  apartirDe: z.number().min(0).max(1_000_000),
  /** 2 significa 2%. Teto alto de propósito: quem cadastra errado vê o erro. */
  percentual: z.number().min(0).max(100),
  fixo: z.number().min(0).max(10_000),
});

const taxasSchema = z.object({
  provider: z.enum(["SYNCPAY", "CODEPAY", "SIGILOPAY", "NEXUSPAG"]),
  /** A lista inteira do gateway. Vazia apaga as faixas dele. */
  faixas: z.array(faixaSchema).max(10),
});

/**
 * Grava as faixas de taxa de um gateway.
 *
 * Substitui a lista inteira, como as outras telas de lista do painel: editar
 * faixa por faixa exigiria id de cada uma na tela e um caminho de remoção
 * separado, para um punhado de linhas que se lê de uma vez.
 *
 * Nenhum valor histórico é reescrito. A taxa é aplicada na leitura do
 * relatório, sobre o valor de cada compra, então corrigir uma faixa hoje
 * corrige também os meses passados, que é o que se espera de quem digitou o
 * percentual errado. O outro caminho (congelar a taxa em cada pagamento)
 * daria número imutável, mas exigiria a faixa cadastrada ANTES da primeira
 * venda, e ninguém cadastra taxa antes de vender.
 */
export async function salvarTaxasDoGatewayAction(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = taxasSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }
    const { provider, faixas } = parsed.data;

    // Duas faixas com o mesmo começo é ambiguidade, não escolha: o banco
    // recusaria pelo unique, e a mensagem dele não diz o que fazer.
    const comecos = new Set<number>();
    for (const f of faixas) {
      if (comecos.has(f.apartirDe)) {
        return {
          ok: false,
          error: `Duas faixas começam em ${f.apartirDe}. Deixe uma só.`,
        };
      }
      comecos.add(f.apartirDe);
    }

    await prisma.$transaction([
      prisma.taxaDeGateway.deleteMany({ where: { tenantId, provider } }),
      ...(faixas.length > 0
        ? [
            prisma.taxaDeGateway.createMany({
              data: faixas.map((f) => ({ tenantId, provider, ...f })),
            }),
          ]
        : []),
    ]);

    // Sem credencial nenhuma aqui: são números de tabela de preço, e saber
    // qual taxa foi cadastrada é justamente o que se procura quando o
    // relatório muda de valor de um dia para o outro.
    await registrarLog({
      acao: "config.pagamento_alterada",
      tenantId,
      alvo: { tipo: "Tenant", id: tenantId },
      detalhes: { o_que: `taxas do ${provider}`, faixas: faixas.length },
    });

    revalidatePath("/admin/configuracoes/pagamentos");
    revalidatePath("/admin/relatorios");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[salvarTaxasDoGatewayAction]", err);
    return { ok: false, error: "Erro ao salvar as taxas" };
  }
}
