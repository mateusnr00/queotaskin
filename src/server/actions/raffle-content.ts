"use server";

// Server actions para conteúdo de uma rifa específica:
// - Imagens (upload, remover, definir capa, reordenar)
// - Prêmios (substitui a lista inteira a cada save)
// - Promoções (substitui a lista inteira a cada save)
//
// O padrão "substitui a lista" é mais simples que CRUD individual porque
// os formulários da aba são auto-contidos (admin edita N linhas e salva).

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { assertRaffleInActiveTenant, getActiveTenantIdForAdmin } from "@/lib/tenant";
import {
  deleteRaffleImage,
  isStorageConfigured,
  pathFromPublicUrl,
  uploadRaffleImage,
} from "@/lib/storage";
import { registrarLog } from "@/server/services/activity-log";
import type { ActionResult } from "@/server/actions/auth";
import { MAX_IMAGES_PER_RAFFLE, MAX_IMAGE_BYTES } from "@/lib/raffle-images";

// Todas as actions abaixo entram no histórico como uma ação só,
// sorteio.conteudo_alterado, com detalhes.o_que nomeando a parte que mudou.
// Uma chave por action (são doze) encheria o catálogo e o filtro da tela sem
// responder nada que o_que já não responda; ganhador é a exceção, porque
// decide quem recebe uma skin (ver setRaffleWinnerAction mais abaixo).
//
// assertRaffleInActiveTenant só valida e não devolve o tenantId, então cada
// ponto de registro busca de novo com getActiveTenantIdForAdmin: mesmo custo
// de authorize, o pulo é só do valor não sair da função.

// =============================================================
// IMAGENS
// =============================================================

// Qualquer image/* passa. Barrar por lista fixa rejeitava AVIF, HEIC e GIF,
// e o navegador nem sempre preenche file.type, daí o fallback pela extensão.
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|heic|heif|svg|tiff?|ico|jfif)$/i;

export async function uploadRaffleImageAction(
  formData: FormData
): Promise<ActionResult<{ id: string; url: string }>> {
  try {
    const session = await getAdminOrThrow();

    if (!isStorageConfigured()) {
      return {
        ok: false,
        error:
          "Supabase Storage não está configurado. Defina as variáveis NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET.",
      };
    }

    const raffleId = formData.get("raffleId");
    const file = formData.get("file");

    if (typeof raffleId !== "string" || !raffleId) {
      return { ok: false, error: "raffleId obrigatório" };
    }
    if (!(file instanceof File)) {
      return { ok: false, error: "Arquivo inválido" };
    }
    await assertRaffleInActiveTenant(raffleId, session.user);
    const pareceImagem =
      file.type.startsWith("image/") || IMAGE_EXT.test(file.name);
    if (!pareceImagem) {
      return { ok: false, error: "O arquivo não parece ser uma imagem" };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: "Imagem grande demais para enviar. Tente uma menor",
      };
    }

    const existing = await prisma.raffleImage.count({ where: { raffleId } });
    if (existing >= MAX_IMAGES_PER_RAFFLE) {
      return {
        ok: false,
        error: `Limite de ${MAX_IMAGES_PER_RAFFLE} imagens por sorteio`,
      };
    }

    const { url } = await uploadRaffleImage(raffleId, file);

    const image = await prisma.raffleImage.create({
      data: {
        raffleId,
        url,
        order: existing,
        // primeira imagem vira capa automaticamente
        isCover: existing === 0,
      },
      select: { id: true, url: true },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "imagem adicionada" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/editar`);
    revalidatePath("/admin/sorteios");
    revalidatePath("/sorteios");
    return { ok: true, data: image };
  } catch (err) {
    console.error("[uploadRaffleImageAction]", err);
    const msg = err instanceof Error ? err.message : "Erro no upload";
    return { ok: false, error: msg };
  }
}

// Adicionar imagem via URL externa, caminho manual quando o upload do
// Supabase tá quebrado ou o admin já tem a imagem hospedada em outro
// lugar (postimg, imgur, etc). A URL é gravada como está; nada de
// re-upload pro nosso bucket. Como o delete do storage só roda quando
// `pathFromPublicUrl` reconhece o domínio do Supabase, URLs externas
// permanecem nos hosts de origem mesmo após o admin remover o card,
// comportamento correto pra não tentar deletar arquivo de terceiros.
const addImageByUrlSchema = z.object({
  raffleId: z.string().cuid(),
  url: z
    .string()
    .trim()
    .min(1, "URL obrigatória")
    .max(2048, "URL muito longa")
    .url("URL inválida")
    .refine(
      (v) => v.startsWith("http://") || v.startsWith("https://"),
      "Use uma URL http(s)"
    ),
});

export async function addRaffleImageByUrlAction(
  raw: unknown
): Promise<ActionResult<{ id: string; url: string }>> {
  try {
    const session = await getAdminOrThrow();
    const parsed = addImageByUrlSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "URL inválida",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { raffleId, url } = parsed.data;
    await assertRaffleInActiveTenant(raffleId, session.user);

    const existing = await prisma.raffleImage.count({ where: { raffleId } });
    if (existing >= MAX_IMAGES_PER_RAFFLE) {
      return {
        ok: false,
        error: `Limite de ${MAX_IMAGES_PER_RAFFLE} imagens por sorteio`,
      };
    }

    const image = await prisma.raffleImage.create({
      data: {
        raffleId,
        url,
        order: existing,
        isCover: existing === 0,
      },
      select: { id: true, url: true },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "imagem por URL" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/editar`);
    revalidatePath("/admin/sorteios");
    revalidatePath("/sorteios");
    return { ok: true, data: image };
  } catch (err) {
    console.error("[addRaffleImageByUrlAction]", err);
    return { ok: false, error: "Erro ao adicionar imagem" };
  }
}

const deleteImageSchema = z.object({
  id: z.string().cuid(),
});

export async function deleteRaffleImageAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = deleteImageSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const img = await prisma.raffleImage.findUnique({
      where: { id: parsed.data.id },
      select: { url: true, raffleId: true, isCover: true },
    });
    if (!img) return { ok: false, error: "Imagem não encontrada" };
    await assertRaffleInActiveTenant(img.raffleId, session.user);

    await prisma.raffleImage.delete({ where: { id: parsed.data.id } });

    // Limpa arquivo no storage (best-effort).
    const path = pathFromPublicUrl(img.url);
    if (path) await deleteRaffleImage(path);

    // Se era a capa, promove a primeira restante a capa.
    if (img.isCover) {
      const next = await prisma.raffleImage.findFirst({
        where: { raffleId: img.raffleId },
        orderBy: { order: "asc" },
      });
      if (next) {
        await prisma.raffleImage.update({
          where: { id: next.id },
          data: { isCover: true },
        });
      }
    }

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: img.raffleId },
      detalhes: { o_que: "imagem removida" },
    });

    revalidatePath(`/admin/sorteios/${img.raffleId}/editar`);
    revalidatePath("/admin/sorteios");
    revalidatePath("/sorteios");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[deleteRaffleImageAction]", err);
    return { ok: false, error: "Erro ao remover imagem" };
  }
}

const setCoverSchema = z.object({
  raffleId: z.string().cuid(),
  imageId: z.string().cuid(),
});

export async function setRaffleCoverAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = setCoverSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    await assertRaffleInActiveTenant(parsed.data.raffleId, session.user);

    await prisma.$transaction(async (tx) => {
      await tx.raffleImage.updateMany({
        where: { raffleId: parsed.data.raffleId },
        data: { isCover: false },
      });
      // Amarra o imageId ao raffle: um id de imagem de OUTRO tenant casa 0
      // linhas e a transação inteira reverte, então não dá para marcar capa
      // alheia (IDOR) nem deixar a própria campanha sem capa.
      const { count } = await tx.raffleImage.updateMany({
        where: { id: parsed.data.imageId, raffleId: parsed.data.raffleId },
        data: { isCover: true },
      });
      if (count === 0) throw new Error("IMAGEM_FORA_DO_SORTEIO");
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: parsed.data.raffleId },
      detalhes: { o_que: "capa" },
    });

    revalidatePath(`/admin/sorteios/${parsed.data.raffleId}/editar`);
    revalidatePath("/admin/sorteios");
    revalidatePath("/sorteios");
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === "IMAGEM_FORA_DO_SORTEIO") {
      return { ok: false, error: "Imagem não pertence a esse sorteio" };
    }
    console.error("[setRaffleCoverAction]", err);
    return { ok: false, error: "Erro ao definir capa" };
  }
}

// =============================================================
// PRÊMIOS
// =============================================================

const prizesSchema = z.object({
  raffleId: z.string().cuid(),
  show: z.boolean().default(true),
  showSkinSpecs: z.boolean().default(false),
  ebookEnabled: z.boolean().default(false),
  ebookTitle: z.string().max(120).optional().default(""),
  ebookText: z.string().max(500).optional().default(""),
  ebookUrl: z
    .string()
    .max(2048)
    .optional()
    .default("")
    .refine(
      (v) => !v || v.startsWith("http://") || v.startsWith("https://"),
      "URL deve começar com http:// ou https://"
    ),
  ebookButtonText: z.string().max(60).optional().default(""),
  prizes: z
    .array(
      z.object({
        description: z.string().min(1, "Descrição obrigatória").max(500).trim(),
        // Metadados da skin de CS2. Todos opcionais, um prêmio pode não
        // ser skin (saldo, periférico) e aí só a descrição é usada.
        imageUrl: z
          .string()
          .max(2048)
          .optional()
          .default("")
          .refine(
            (v) => !v || v.startsWith("http://") || v.startsWith("https://"),
            "URL da imagem deve começar com http:// ou https://"
          ),
        skinName: z.string().max(200).optional().default(""),
        skinRarity: z
          .enum([
            "CONSUMER",
            "INDUSTRIAL",
            "MIL_SPEC",
            "RESTRICTED",
            "CLASSIFIED",
            "COVERT",
            "CONTRABAND",
            "EXTRAORDINARY",
          ])
          .optional()
          .nullable()
          .default(null),
        skinWear: z
          .enum([
            "FACTORY_NEW",
            "MINIMAL_WEAR",
            "FIELD_TESTED",
            "WELL_WORN",
            "BATTLE_SCARRED",
          ])
          .optional()
          .nullable()
          .default(null),
        skinFloat: z.coerce
          .number()
          .min(0, "Float não pode ser negativo")
          .max(1, "Float vai de 0 a 1")
          .optional()
          .nullable()
          .default(null),
        skinStatTrak: z.boolean().default(false),
        skinSouvenir: z.boolean().default(false),
        skinValueBrl: z.coerce
          .number()
          .min(0)
          .max(99_999_999.99)
          .optional()
          .nullable()
          .default(null),
        skinCollection: z.string().max(160).optional().default(""),
        // Allow-list de protocolo, igual a imageUrl/ebookUrl acima: este valor
        // vira um href na página pública da campanha (skin-card.tsx), e sem a
        // checagem um javascript:… gravado pelo painel executaria no visitante
        // que clica em "Inspecionar no jogo" (stored XSS).
        skinInspectUrl: z
          .string()
          .max(2048)
          .optional()
          .default("")
          .refine(
            (v) => !v || v.startsWith("http://") || v.startsWith("https://"),
            "O link de inspeção deve começar com http:// ou https://"
          ),
      })
    )
    .max(10, "Máximo de 10 prêmios"),
});

export async function setRafflePrizesAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = prizesSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const {
      raffleId,
      prizes,
      show,
      showSkinSpecs,
      ebookEnabled,
      ebookTitle,
      ebookText,
      ebookUrl,
      ebookButtonText,
    } = parsed.data;
    await assertRaffleInActiveTenant(raffleId, session.user);

    const norm = (v: string) => (v.trim() ? v.trim() : null);

    await prisma.$transaction([
      prisma.raffle.update({
        where: { id: raffleId },
        data: {
          prizesShow: show,
          showSkinSpecs,
          ebookEnabled,
          ebookTitle: norm(ebookTitle),
          ebookText: norm(ebookText),
          ebookUrl: norm(ebookUrl),
          ebookButtonText: norm(ebookButtonText),
        },
      }),
      prisma.prize.deleteMany({ where: { raffleId } }),
      prisma.prize.createMany({
        data: prizes.map((p, i) => ({
          raffleId,
          position: i + 1,
          description: p.description,
          imageUrl: norm(p.imageUrl),
          skinName: norm(p.skinName),
          skinRarity: p.skinRarity,
          skinWear: p.skinWear,
          skinFloat: p.skinFloat,
          skinStatTrak: p.skinStatTrak,
          skinSouvenir: p.skinSouvenir,
          skinValueBrl: p.skinValueBrl,
          skinCollection: norm(p.skinCollection),
          skinInspectUrl: norm(p.skinInspectUrl),
        })),
      }),
    ]);

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "prêmios" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/editar`);
    revalidatePath("/admin/sorteios");
    revalidatePath("/sorteios");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[setRafflePrizesAction]", err);
    return { ok: false, error: "Erro ao salvar prêmios" };
  }
}

// =============================================================
// PROMOÇÕES
// =============================================================

const promotionsSchema = z.object({
  raffleId: z.string().cuid(),
  enabled: z.boolean().default(true),
  doubleEnabled: z.boolean().default(false),
  accumulative: z.boolean().default(false),
  promotions: z
    .array(
      z.object({
        quantity: z.coerce.number().int().min(1).max(10_000_000),
        price: z.coerce.number().min(0).max(99_999_999.99),
        label: z.string().max(60).optional().nullable(),
        type: z.enum(["QTY", "MORE_THAN"]).default("QTY"),
      })
    )
    .max(20, "Máximo de 20 promoções"),
});

// Escolha de gateway pra um sorteio específico. null = herda o padrão do
// tenant. Credenciais não passam por aqui, só a escolha do provider.
const paymentProviderSchema = z.object({
  raffleId: z.string().cuid(),
  paymentProvider: z.enum(["SYNCPAY", "CODEPAY"]).nullable(),
});

export async function setRafflePaymentProviderAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = paymentProviderSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const { raffleId, paymentProvider } = parsed.data;
    await assertRaffleInActiveTenant(raffleId, session.user);

    await prisma.raffle.update({
      where: { id: raffleId },
      data: { paymentProvider },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "gateway do sorteio" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/editar`);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[setRafflePaymentProviderAction]", err);
    return { ok: false, error: "Erro ao salvar gateway do sorteio" };
  }
}

export async function setRafflePromotionsAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = promotionsSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const { raffleId, promotions, enabled, doubleEnabled, accumulative } =
      parsed.data;
    await assertRaffleInActiveTenant(raffleId, session.user);

    await prisma.$transaction([
      prisma.raffle.update({
        where: { id: raffleId },
        data: {
          promotionsEnabled: enabled,
          promotionsDoubleEnabled: doubleEnabled,
          promotionsAccumulative: accumulative,
        },
      }),
      prisma.promotion.deleteMany({ where: { raffleId } }),
      prisma.promotion.createMany({
        data: promotions.map((p) => ({
          raffleId,
          quantity: p.quantity,
          price: p.price,
          label: p.label || null,
          type: p.type,
        })),
      }),
    ]);

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "promoções" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/editar`);
    revalidatePath(`/sorteios`);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[setRafflePromotionsAction]", err);
    return { ok: false, error: "Erro ao salvar promoções" };
  }
}

// Títulos premiados: lista de números específicos que valem prêmio
// instantâneo + config de UX (toggles, modo de exibição, textos pro
// ganhador/perdedor). Tudo salvo numa chamada só pra não criar inconsistência
// entre lista cadastrada e feature desligada.
const awardedTicketsSchema = z.object({
  raffleId: z.string().cuid(),
  enabled: z.boolean().default(true),
  showList: z.boolean().default(true),
  viewMode: z.enum(["list", "modal"]).default("list"),
  winnerText: z.string().max(500).optional().default(""),
  loserShow: z.boolean().default(true),
  loserTitle: z.string().max(120).optional().default(""),
  loserText: z.string().max(500).optional().default(""),
  items: z
    .array(
      z.object({
        number: z.coerce.number().int().min(1).max(10_000_000),
        prizeDescription: z.string().min(1).max(200),
      })
    )
    .max(500, "Máximo de 500 títulos premiados por sorteio"),
});

export async function setRaffleAwardedTicketsAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = awardedTicketsSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const {
      raffleId,
      items,
      enabled,
      showList,
      viewMode,
      winnerText,
      loserShow,
      loserTitle,
      loserText,
    } = parsed.data;
    await assertRaffleInActiveTenant(raffleId, session.user);

    // Valida limite: números devem estar dentro do intervalo da rifa.
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { totalNumbers: true },
    });
    if (!raffle) {
      return { ok: false, error: "Sorteio não encontrado" };
    }
    const out = items.filter(
      (i) => i.number < 1 || i.number > raffle.totalNumbers
    );
    if (out.length > 0) {
      return {
        ok: false,
        error: `Números fora do intervalo (1 a ${raffle.totalNumbers}): ${out
          .map((o) => o.number)
          .join(", ")}`,
      };
    }

    // Remove duplicatas mantendo a última descrição. Postgres reclama em
    // unique([raffleId, number]) na hora do createMany se tiver dup.
    const dedupe = new Map<number, string>();
    for (const i of items) dedupe.set(i.number, i.prizeDescription);

    const norm = (v: string) => (v.trim() ? v.trim() : null);

    await prisma.$transaction([
      prisma.raffle.update({
        where: { id: raffleId },
        data: {
          awardedTicketsEnabled: enabled,
          awardedTicketsShowList: showList,
          awardedTicketsViewMode: viewMode,
          awardedTicketsWinnerText: norm(winnerText),
          awardedTicketsLoserShow: loserShow,
          awardedTicketsLoserTitle: norm(loserTitle),
          awardedTicketsLoserText: norm(loserText),
        },
      }),
      prisma.awardedTicket.deleteMany({ where: { raffleId } }),
      prisma.awardedTicket.createMany({
        data: [...dedupe.entries()].map(([number, prizeDescription]) => ({
          raffleId,
          number,
          prizeDescription,
          isInstantPrize: true,
        })),
      }),
    ]);

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "títulos premiados" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/editar`);
    revalidatePath(`/s/`);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[setRaffleAwardedTicketsAction]", err);
    return { ok: false, error: "Erro ao salvar títulos premiados" };
  }
}

// =============================================================
// CAIXAS SURPRESAS, combos (X cotas → N caixas)
// =============================================================

const surpriseBoxCombosSchema = z.object({
  raffleId: z.string().cuid(),
  enabled: z.boolean().default(false),
  accumulative: z.boolean().default(false),
  abrirTodas: z.boolean().default(false),
  exibirGanhadores: z.boolean().default(false),
  displayOrder: z.enum(["RANDOM", "ASC", "DESC"]).default("RANDOM"),
  combos: z
    .array(
      z.object({
        threshold: z.coerce.number().int().min(1).max(10_000_000),
        boxCount: z.coerce.number().int().min(1).max(1000),
        visible: z.boolean().default(true),
        highlighted: z.boolean().default(false),
      })
    )
    .max(20, "Máximo de 20 combos"),
});

// Substitui a lista inteira a cada save (mesmo padrão de Promotion/Prize).
// Dedup por threshold, combos com mesma quantidade colidem no @@unique.
export async function setRaffleSurpriseBoxCombosAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = surpriseBoxCombosSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const {
      raffleId,
      combos,
      enabled,
      accumulative,
      abrirTodas,
      exibirGanhadores,
      displayOrder,
    } = parsed.data;
    await assertRaffleInActiveTenant(raffleId, session.user);

    const dedupe = new Map<
      number,
      { boxCount: number; visible: boolean; highlighted: boolean }
    >();
    for (const c of combos) {
      dedupe.set(c.threshold, {
        boxCount: c.boxCount,
        visible: c.visible,
        highlighted: c.highlighted,
      });
    }

    await prisma.$transaction([
      prisma.raffle.update({
        where: { id: raffleId },
        data: {
          surpriseBoxEnabled: enabled,
          surpriseBoxCombosAccumulative: accumulative,
          surpriseBoxAbrirTodas: abrirTodas,
          surpriseBoxExibirGanhadores: exibirGanhadores,
          surpriseBoxDisplayOrder: displayOrder,
        },
      }),
      prisma.surpriseBoxCombo.deleteMany({ where: { raffleId } }),
      prisma.surpriseBoxCombo.createMany({
        data: [...dedupe.entries()].map(([threshold, c]) => ({
          raffleId,
          threshold,
          boxCount: c.boxCount,
          visible: c.visible,
          highlighted: c.highlighted,
        })),
      }),
    ]);

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "combos de caixa surpresa" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/compras`);
    revalidatePath(`/admin/sorteios/${raffleId}/editar`);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[setRaffleSurpriseBoxCombosAction]", err);
    return { ok: false, error: "Erro ao salvar combos de caixas" };
  }
}

// =============================================================
// CAIXAS SURPRESAS, pool de prêmios (lista de itens da caixa)
// =============================================================

const surpriseBoxPrizeBatchSchema = z.object({
  raffleId: z.string().cuid(),
  title: z.string().min(1).max(120),
  prize: z.string().min(1).max(200),
  // Quantidade de unidades a criar de uma vez (form "Quantidade de Caixas"
  // do print). Limite máximo de 100 por cadastro conforme spec.
  quantity: z.coerce.number().int().min(1).max(100),
  mode: z.enum(["RANDOM", "PERCENT"]).default("RANDOM"),
  // Odds 0-100 só em PERCENT. Em RANDOM o campo é ignorado.
  odds: z.coerce.number().min(0).max(100).optional().nullable(),
  locked: z.boolean().default(false),
});

// Cria N unidades do mesmo prêmio (1 linha = 1 unidade no banco, modelo
// que casa com a listagem pública "115/500 Disponível/Ganhador").
export async function createSurpriseBoxPrizesAction(
  raw: unknown
): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await getAdminOrThrow();
    const parsed = surpriseBoxPrizeBatchSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const { raffleId, title, prize, quantity, mode, odds, locked } = parsed.data;
    await assertRaffleInActiveTenant(raffleId, session.user);

    const result = await prisma.surpriseBoxPrize.createMany({
      data: Array.from({ length: quantity }, () => ({
        raffleId,
        title: title.trim(),
        prize: prize.trim(),
        mode,
        // Em RANDOM zera odds; em PERCENT usa o valor (NULL se admin não passou).
        odds: mode === "PERCENT" && odds != null ? odds : null,
        locked,
      })),
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "prêmios de caixa surpresa" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/compras`);
    return { ok: true, data: { count: result.count } };
  } catch (err) {
    console.error("[createSurpriseBoxPrizesAction]", err);
    return { ok: false, error: "Erro ao cadastrar prêmios" };
  }
}

const surpriseBoxPrizeIdSchema = z.object({
  prizeId: z.string().cuid(),
});

// Toggle lock/unlock de um prêmio. Prêmio com claimedAt setado (já saiu
// numa caixa) não pode mudar lock, não faria diferença.
export async function toggleSurpriseBoxPrizeLockAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = surpriseBoxPrizeIdSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }
    const prize = await prisma.surpriseBoxPrize.findUnique({
      where: { id: parsed.data.prizeId },
      select: { raffleId: true, locked: true, claimedAt: true },
    });
    if (!prize) return { ok: false, error: "Prêmio não encontrado" };
    await assertRaffleInActiveTenant(prize.raffleId, session.user);
    if (prize.claimedAt) {
      return { ok: false, error: "Prêmio já foi sorteado, não pode ser bloqueado" };
    }

    await prisma.surpriseBoxPrize.update({
      where: { id: parsed.data.prizeId },
      data: { locked: !prize.locked },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: prize.raffleId },
      detalhes: { o_que: "trava de prêmio de caixa" },
    });

    revalidatePath(`/admin/sorteios/${prize.raffleId}/compras`);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[toggleSurpriseBoxPrizeLockAction]", err);
    return { ok: false, error: "Erro ao alterar bloqueio" };
  }
}

// Remove um prêmio do pool. Prêmio já sorteado (claimedAt setado) não
// pode ser deletado, preserva histórico do ganhador.
export async function deleteSurpriseBoxPrizeAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = surpriseBoxPrizeIdSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }
    const prize = await prisma.surpriseBoxPrize.findUnique({
      where: { id: parsed.data.prizeId },
      select: { raffleId: true, claimedAt: true },
    });
    if (!prize) return { ok: false, error: "Prêmio não encontrado" };
    await assertRaffleInActiveTenant(prize.raffleId, session.user);
    if (prize.claimedAt) {
      return { ok: false, error: "Prêmio já foi sorteado, não pode ser excluído" };
    }

    await prisma.surpriseBoxPrize.delete({
      where: { id: parsed.data.prizeId },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: prize.raffleId },
      detalhes: { o_que: "prêmio de caixa removido" },
    });

    revalidatePath(`/admin/sorteios/${prize.raffleId}/compras`);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[deleteSurpriseBoxPrizeAction]", err);
    return { ok: false, error: "Erro ao excluir prêmio" };
  }
}

// =============================================================
// GANHADOR DO SORTEIO PRINCIPAL
// =============================================================

const setWinnerSchema = z.object({
  raffleId: z.string().cuid(),
  ticketNumber: z.coerce.number().int().min(1).max(10_000_000),
  note: z.string().max(2000).optional().default(""),
  // Se true, promove o sorteio pra FINISHED. Default true, declarar
  // ganhador implica encerrar a rifa. Admin pode desligar (raro) se quer
  // registrar antes e fechar depois.
  finish: z.boolean().default(true),
});

export interface WinnerInfo {
  ticketNumber: number;
  participantName: string | null;
  participantPhone: string | null;
  participantCpf: string | null;
  drawnAt: string;
  note: string | null;
}

export async function setRaffleWinnerAction(
  raw: unknown
): Promise<ActionResult<WinnerInfo>> {
  try {
    const session = await getAdminOrThrow();
    const parsed = setWinnerSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    const { raffleId, ticketNumber, note, finish } = parsed.data;
    await assertRaffleInActiveTenant(raffleId, session.user);

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { totalNumbers: true },
    });
    if (!raffle) return { ok: false, error: "Sorteio não encontrado" };
    if (ticketNumber < 1 || ticketNumber > raffle.totalNumbers) {
      return {
        ok: false,
        error: `Número fora do intervalo (1 a ${raffle.totalNumbers})`,
        fieldErrors: { ticketNumber: ["Fora do intervalo do sorteio"] },
      };
    }

    // Busca o dono do ticket sorteado. Precisa ser PAID ou AWARDED, se o
    // número não foi comprado, o admin errou o input.
    const ticket = await prisma.ticket.findFirst({
      where: {
        raffleId,
        number: ticketNumber,
        status: { in: ["PAID", "AWARDED"] },
      },
      select: {
        reservation: {
          select: {
            participantName: true,
            participantPhone: true,
            participantCpf: true,
          },
        },
      },
    });

    const drawnAt = new Date();
    await prisma.raffle.update({
      where: { id: raffleId },
      data: {
        winnerTicketNumber: ticketNumber,
        winnerDrawnAt: drawnAt,
        winnerNote: note.trim() || null,
        ...(finish ? { status: "FINISHED" } : {}),
      },
    });

    await registrarLog({
      acao: "sorteio.ganhador_definido",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { numero: ticketNumber },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/compras`);
    revalidatePath(`/admin/sorteios`);
    revalidatePath(`/sorteios`);
    // O slug da rifa pública muda por tenant, invalida o pai que abriga
    // todas as rifas públicas.
    revalidatePath(`/s/`);

    return {
      ok: true,
      data: {
        ticketNumber,
        participantName: ticket?.reservation?.participantName ?? null,
        participantPhone: ticket?.reservation?.participantPhone ?? null,
        participantCpf: ticket?.reservation?.participantCpf ?? null,
        drawnAt: drawnAt.toISOString(),
        note: note.trim() || null,
      },
    };
  } catch (err) {
    console.error("[setRaffleWinnerAction]", err);
    return { ok: false, error: "Erro ao definir ganhador" };
  }
}

const clearWinnerSchema = z.object({
  raffleId: z.string().cuid(),
});

// Desfaz a definição de ganhador, volta a rifa pro estado ACTIVE se
// estava FINISHED. Útil se o admin declarou o número errado.
export async function clearRaffleWinnerAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = clearWinnerSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    await assertRaffleInActiveTenant(parsed.data.raffleId, session.user);

    await prisma.raffle.update({
      where: { id: parsed.data.raffleId },
      data: {
        winnerTicketNumber: null,
        winnerDrawnAt: null,
        winnerNote: null,
        status: "ACTIVE",
      },
    });

    await registrarLog({
      acao: "sorteio.ganhador_removido",
      tenantId: await getActiveTenantIdForAdmin(session.user),
      alvo: { tipo: "Raffle", id: parsed.data.raffleId },
    });

    revalidatePath(`/admin/sorteios/${parsed.data.raffleId}/compras`);
    revalidatePath(`/admin/sorteios`);
    revalidatePath(`/sorteios`);
    revalidatePath(`/s/`);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[clearRaffleWinnerAction]", err);
    return { ok: false, error: "Erro ao limpar ganhador" };
  }
}
