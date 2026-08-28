"use server";

// Configurações de identidade e tema POR TENANT. Cada admin edita só o
// próprio tenant (resolvido pelo host atual via getActiveTenantIdForAdmin).
// Antes essas configs viviam num `SiteSettings` singleton global, o que
// causava sobrescrita entre tenants, agora elas residem em colunas do
// `Tenant`.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import {
  deleteRaffleImage,
  isStorageConfigured,
  pathFromPublicUrl,
  uploadRaffleImage,
} from "@/lib/storage";
import { THEME_PRESET_KEYS } from "@/lib/theme-presets";
import type { ActionResult } from "@/server/actions/auth";

// Schema único pra preferências visuais de tema. Todos opcionais.
const themeSchema = z.object({
  themeMode: z.enum(["LIGHT", "DARK"]).optional(),
  themePreset: z.enum(THEME_PRESET_KEYS as [string, ...string[]]).optional(),
  headerAccent: z.boolean().optional(),
  cardColor: z.enum(["black", "white", "accent"]).optional(),
});

// Schema pras configurações gerais do site (identidade + personalização da
// home). Tudo opcional, atualiza só o que veio.
const siteSettingsSchema = z.object({
  companyName: z.string().min(1, "Nome obrigatório").max(120).optional(),
  // Como a logo se encaixa no cabeçalho. Só quem envia a imagem sabe se ela
  // é um emblema (círculo) ou uma faixa com o nome (sem recorte).
  logoShape: z.enum(["ROUND", "RECTANGLE"]).optional(),
  siteDescription: z.string().max(200).optional(),
  supportPhone: z
    .string()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  supportEmail: z
    .string()
    .email("E-mail inválido")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  homeCampaignsTitle: z.string().max(60).optional(),
  homeCampaignsCaption: z.string().max(120).optional(),
  showWinnersOnHome: z.boolean().optional(),
  // URL da imagem mostrada na tela "Pagamento confirmado" (LEGADO, agora
  // vive em Tenant.paidImageUrl via /configuracoes/mensagens). Aceito aqui
  // só por compat se o admin form antigo ainda mandar esse campo.
  thankYouImageUrl: z
    .string()
    .max(2048)
    .optional()
    .nullable()
    .refine(
      (v) =>
        !v ||
        (v.startsWith("http://") || v.startsWith("https://")) &&
          isValidUrl(v),
      "URL inválida"
    )
    .transform((v) => (v ? v : null)),
  // Aba "Campanha / Compra", config per-tenant.
  loginMode: z.enum(["phone", "cpf"]).optional(),
  numbersNomenclature: z
    .enum(["titulos", "numeros", "bilhetes", "numeros_sorte"])
    .optional(),
  quantityCardsHeading: z
    .string()
    .max(50)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  minPurchaseAge: z.coerce
    .number()
    .int()
    .refine((v) => [16, 18, 21].includes(v), "Idade inválida")
    .optional(),
  // Aba "Experiência do Usuário", config global per-tenant.
  affiliateCookieHours: z.coerce
    .number()
    .int()
    .refine(
      (v) => [1, 2, 3, 4, 5, 6, 12, 24, 48, 72, 96, 120].includes(v),
      "Valor inválido"
    )
    .optional(),
  rankingOrderBy: z.enum(["quantity", "total"]).optional(),
  rankingCacheMinutes: z.coerce
    .number()
    .int()
    .refine(
      (v) => [1, 2, 3, 4, 5, 10, 15, 20, 30, 45, 60].includes(v),
      "Valor inválido"
    )
    .optional(),
  requireAddressOnSignup: z.boolean().optional(),
  allowPublicAffiliate: z.boolean().optional(),
  shareButtonsGlobal: z.boolean().optional(),
  allowQuantityKeyboardInput: z.boolean().optional(),
  buyerPrivacy: z.boolean().optional(),
  carouselAutoPlay: z.boolean().optional(),
  showCardPrices: z.boolean().optional(),
  showAppButton: z.boolean().optional(),
  // Aba "Prêmios Instantâneos".
  instantPrizesOrder: z
    .array(
      z.enum(["awarded_numbers", "awarded_box", "reward_spin", "scratch_card"])
    )
    .length(4, "Lista deve conter as 4 modalidades")
    .optional(),
  awardedSectionTitle: z.string().min(1, "Obrigatório").max(120).optional(),
  showAwardedOnlyWhenDistributed: z.boolean().optional(),
  showAwardedNumbers: z.boolean().optional(),
  showAwardedNumbersBoxes: z.boolean().optional(),
  showAwardedNumbersRoulette: z.boolean().optional(),
  showAwardedNumbersScratchCard: z.boolean().optional(),
  aggregateInstantAwards: z.boolean().optional(),
  disableInstantAwardsRepeatWinners: z.boolean().optional(),
  // Aba "Preços / Promoções".
  showPromotionsPercentage: z.boolean().optional(),
  showCombosPrice: z.boolean().optional(),
  showFees: z.boolean().optional(),
});

function isValidUrl(v: string): boolean {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

export async function updateThemeAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = themeSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return { ok: true, data: undefined };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data,
    });

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[updateThemeAction]", err);
    return { ok: false, error: "Erro ao salvar tema" };
  }
}

export async function updateSiteAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = siteSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return { ok: true, data: undefined };
    }

    // `companyName` historicamente era o nome de exibição do site,
    // agora ele mapeia direto pro Tenant.name (não há duplicação).
    // `thankYouImageUrl` mapeia pro Tenant.paidImageUrl (LEGADO, o
    // form novo usa /configuracoes/mensagens que escreve direto lá).
    const update: Record<string, unknown> = {};
    if (data.companyName !== undefined) update.name = data.companyName;
    if (data.logoShape !== undefined) update.logoShape = data.logoShape;
    if (data.siteDescription !== undefined) update.siteDescription = data.siteDescription;
    if (data.supportPhone !== undefined) update.supportPhone = data.supportPhone;
    if (data.supportEmail !== undefined) update.supportEmail = data.supportEmail;
    if (data.homeCampaignsTitle !== undefined) update.homeCampaignsTitle = data.homeCampaignsTitle;
    if (data.homeCampaignsCaption !== undefined) update.homeCampaignsCaption = data.homeCampaignsCaption;
    if (data.showWinnersOnHome !== undefined) update.showWinnersOnHome = data.showWinnersOnHome;
    if (data.thankYouImageUrl !== undefined) update.paidImageUrl = data.thankYouImageUrl;
    if (data.loginMode !== undefined) update.loginMode = data.loginMode;
    if (data.numbersNomenclature !== undefined)
      update.numbersNomenclature = data.numbersNomenclature;
    if (data.quantityCardsHeading !== undefined)
      update.quantityCardsHeading = data.quantityCardsHeading;
    if (data.minPurchaseAge !== undefined)
      update.minPurchaseAge = data.minPurchaseAge;
    if (data.affiliateCookieHours !== undefined)
      update.affiliateCookieHours = data.affiliateCookieHours;
    if (data.rankingOrderBy !== undefined)
      update.rankingOrderBy = data.rankingOrderBy;
    if (data.rankingCacheMinutes !== undefined)
      update.rankingCacheMinutes = data.rankingCacheMinutes;
    if (data.requireAddressOnSignup !== undefined)
      update.requireAddressOnSignup = data.requireAddressOnSignup;
    if (data.allowPublicAffiliate !== undefined)
      update.allowPublicAffiliate = data.allowPublicAffiliate;
    if (data.shareButtonsGlobal !== undefined)
      update.shareButtonsGlobal = data.shareButtonsGlobal;
    if (data.allowQuantityKeyboardInput !== undefined)
      update.allowQuantityKeyboardInput = data.allowQuantityKeyboardInput;
    if (data.buyerPrivacy !== undefined)
      update.buyerPrivacy = data.buyerPrivacy;
    if (data.carouselAutoPlay !== undefined)
      update.carouselAutoPlay = data.carouselAutoPlay;
    if (data.showCardPrices !== undefined)
      update.showCardPrices = data.showCardPrices;
    if (data.showAppButton !== undefined)
      update.showAppButton = data.showAppButton;
    if (data.instantPrizesOrder !== undefined)
      update.instantPrizesOrder = data.instantPrizesOrder;
    if (data.awardedSectionTitle !== undefined)
      update.awardedSectionTitle = data.awardedSectionTitle;
    if (data.showAwardedOnlyWhenDistributed !== undefined)
      update.showAwardedOnlyWhenDistributed = data.showAwardedOnlyWhenDistributed;
    if (data.showAwardedNumbers !== undefined)
      update.showAwardedNumbers = data.showAwardedNumbers;
    if (data.showAwardedNumbersBoxes !== undefined)
      update.showAwardedNumbersBoxes = data.showAwardedNumbersBoxes;
    if (data.showAwardedNumbersRoulette !== undefined)
      update.showAwardedNumbersRoulette = data.showAwardedNumbersRoulette;
    if (data.showAwardedNumbersScratchCard !== undefined)
      update.showAwardedNumbersScratchCard = data.showAwardedNumbersScratchCard;
    if (data.aggregateInstantAwards !== undefined)
      update.aggregateInstantAwards = data.aggregateInstantAwards;
    if (data.disableInstantAwardsRepeatWinners !== undefined)
      update.disableInstantAwardsRepeatWinners =
        data.disableInstantAwardsRepeatWinners;
    if (data.showPromotionsPercentage !== undefined)
      update.showPromotionsPercentage = data.showPromotionsPercentage;
    if (data.showCombosPrice !== undefined)
      update.showCombosPrice = data.showCombosPrice;
    if (data.showFees !== undefined) update.showFees = data.showFees;

    if (Object.keys(update).length === 0) {
      return { ok: true, data: undefined };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: update,
    });

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[updateSiteAction]", err);
    return { ok: false, error: "Erro ao salvar configurações" };
  }
}

// =============================================================
// LOGO upload (Supabase Storage)
// =============================================================

const MAX_LOGO_BYTES = 3 * 1024 * 1024; // 3 MB (Sorteamos usa 3.1 MB)
// Qualquer image/* serve. Lista fixa rejeitava AVIF, HEIC e arquivos que o
// navegador entrega sem file.type, daí a checagem também pela extensão.
const LOGO_EXT =
  /\.(png|jpe?g|webp|gif|avif|bmp|heic|heif|svg|tiff?|ico|jfif)$/i;

// Os três espaços de imagem do site. Ficam separados porque têm formatos
// incompatíveis: a logo é uma faixa larga com o nome escrito, o favicon é
// lido a 16px num quadrado, e o fundo cobre uma tela inteira.
export type SlotDeImagem = "logo" | "favicon" | "fundo";

const COLUNA_POR_SLOT: Record<
  SlotDeImagem,
  "logoUrl" | "faviconUrl" | "authBackgroundUrl"
> = {
  logo: "logoUrl",
  favicon: "faviconUrl",
  fundo: "authBackgroundUrl",
};

const COLUNAS_DE_IMAGEM = {
  logoUrl: true,
  faviconUrl: true,
  authBackgroundUrl: true,
} as const;

function slotDoFormulario(valor: FormDataEntryValue | null): SlotDeImagem {
  if (valor === "favicon") return "favicon";
  if (valor === "fundo") return "fundo";
  return "logo";
}

export async function uploadLogoAction(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const slot = slotDoFormulario(formData.get("slot"));
    const coluna = COLUNA_POR_SLOT[slot];
    if (!isStorageConfigured()) {
      return {
        ok: false,
        error:
          "Supabase Storage não está configurado. Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET.",
      };
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: "Arquivo inválido" };
    }
    if (!file.type.startsWith("image/") && !LOGO_EXT.test(file.name)) {
      return { ok: false, error: "O arquivo não parece ser uma imagem" };
    }
    if (file.size > MAX_LOGO_BYTES) {
      return {
        ok: false,
        error: "Imagem grande demais para enviar. Tente uma menor",
      };
    }

    // Apaga o logo anterior (best-effort) antes de subir o novo.
    const existing = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: COLUNAS_DE_IMAGEM,
    });
    const anterior = existing?.[coluna];
    if (anterior) {
      const oldPath = pathFromPublicUrl(anterior);
      if (oldPath) await deleteRaffleImage(oldPath);
    }

    // Reusa o helper de raffle-images com pasta diferente: "site".
    const { url } = await uploadRaffleImage("site", file);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { [coluna]: url },
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { url } };
  } catch (err) {
    console.error("[uploadLogoAction]", err);
    const msg = err instanceof Error ? err.message : "Erro no upload";
    return { ok: false, error: msg };
  }
}

// Define o logo via URL externa, caminho manual quando o upload do
// Supabase tá quebrado ou o admin já tem o arquivo hospedado em outro
// host (postimg, imgur, etc). URL gravada como veio; só apaga o arquivo
// anterior do Supabase se for um path nosso.
const logoUrlSchema = z.object({
  slot: z.enum(["logo", "favicon", "fundo"]).default("logo"),
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

export async function setLogoByUrlAction(
  raw: unknown
): Promise<ActionResult<{ url: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = logoUrlSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "URL inválida",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const coluna = COLUNA_POR_SLOT[parsed.data.slot];
    // Se a imagem anterior era do nosso bucket, apaga (best-effort).
    const existing = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: COLUNAS_DE_IMAGEM,
    });
    const anterior = existing?.[coluna];
    if (anterior) {
      const oldPath = pathFromPublicUrl(anterior);
      if (oldPath) await deleteRaffleImage(oldPath);
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { [coluna]: parsed.data.url },
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { url: parsed.data.url } };
  } catch (err) {
    console.error("[setLogoByUrlAction]", err);
    return { ok: false, error: "Erro ao definir logo" };
  }
}

export async function removeLogoAction(
  slot: SlotDeImagem = "logo"
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const coluna = COLUNA_POR_SLOT[slot];
    const existing = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: COLUNAS_DE_IMAGEM,
    });
    const anterior = existing?.[coluna];
    if (anterior) {
      const path = pathFromPublicUrl(anterior);
      if (path) await deleteRaffleImage(path);
    }
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { [coluna]: null },
    });
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[removeLogoAction]", err);
    return { ok: false, error: "Erro ao remover logo" };
  }
}

/**
 * Id do pixel da Meta.
 *
 * Guardado como texto e não como número: o id tem 15 ou 16 dígitos e cabe
 * mal em inteiro de 32 bits, e ninguém faz conta com ele.
 *
 * Vazio desliga. É o caminho de sair do rastreamento sem precisar de outro
 * botão: sem id, nenhum script de terceiro entra na página de quem compra.
 */
const pixelSchema = z.object({
  metaPixelId: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^\d{10,20}$/.test(v),
      "O id do pixel é só de números, com 15 ou 16 dígitos",
    ),
});

export async function updateMetaPixelAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = pixelSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { metaPixelId: parsed.data.metaPixelId || null },
    });

    // O pixel entra no layout público, que é servido para todo mundo: sem
    // invalidar, quem já tinha a página em cache continuaria sem ele.
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[updateMetaPixelAction]", err);
    return { ok: false, error: "Erro ao salvar o pixel" };
  }
}
