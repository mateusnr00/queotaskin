"use server";

// Server actions para conteúdo de uma rifa específica:
// - Imagens (upload, remover, definir capa, reordenar)
// - Prêmios (substitui a lista inteira a cada save)
// - Promoções (substitui a lista inteira a cada save)
//
// O padrão "substitui a lista" é mais simples que CRUD individual porque
// os formulários da aba são auto-contidos (admin edita N linhas e salva).

import { revalidatePath } from "next/cache";
import { agendarSaida } from "@/lib/saida";
import { SkinRarity } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { assertRaffleInActiveTenant } from "@/lib/tenant";
import { chaveDoNome, raridadeDoPremio } from "@/lib/premio-nome";
import {
  apagarArquivoSeOrfao,
  isStorageConfigured,
  uploadRaffleImage,
} from "@/lib/storage";
import { registrarLog } from "@/server/services/activity-log";
import { expireForRaffle } from "@/server/services/reservations";
import { contarOcupados } from "@/server/services/vendidos";
import { sortearTitulosLivres } from "@/server/services/titulos-livres";
import type { ActionResult } from "@/server/actions/auth";
import { MAX_IMAGES_PER_RAFFLE, MAX_IMAGE_BYTES } from "@/lib/raffle-images";
import { dataDeSaoPauloParaUtc } from "@/lib/promocao-em-dobro";

// Todas as actions abaixo entram no histórico como uma ação só,
// sorteio.conteudo_alterado, com detalhes.o_que nomeando a parte que mudou.
// Uma chave por action (são doze) encheria o catálogo e o filtro da tela sem
// responder nada que o_que já não responda; ganhador é a exceção, porque
// decide quem recebe uma skin (ver setRaffleWinnerAction mais abaixo).
//
// assertRaffleInActiveTenant devolve o tenantId que ela mesma resolveu pra
// autorizar; cada ponto de registro reaproveita esse valor em vez de buscar
// de novo, o que evita uma consulta a mais e uma segunda chamada que poderia
// lançar já depois da escrita ter dado certo.

// =============================================================
// IMAGENS
// =============================================================

// Qualquer image/* passa. Barrar por lista fixa rejeitava AVIF, HEIC e GIF,
// e o navegador nem sempre preenche file.type, daí o fallback pela extensão.
const IMAGE_EXT =
  /\.(png|jpe?g|webp|gif|avif|bmp|heic|heif|svg|tiff?|ico|jfif)$/i;

export async function uploadRaffleImageAction(
  formData: FormData,
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
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);
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
      tenantId,
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
      "Use uma URL http(s)",
    ),
});

export async function addRaffleImageByUrlAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; url: string }>> {
  try {
    const session = await getAdminOrThrow();
    const parsed = addImageByUrlSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "URL inválida",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { raffleId, url } = parsed.data;
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

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
      tenantId,
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
  raw: unknown,
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
    const tenantId = await assertRaffleInActiveTenant(
      img.raffleId,
      session.user,
    );

    await prisma.raffleImage.delete({ where: { id: parsed.data.id } });

    // Limpa o arquivo SÓ se mais ninguém apontar para ele. As campanhas
    // criadas antes da cópia compartilham o arquivo com a arte da skin, e
    // apagar aqui levava a arte junto: ela continuava no banco apontando
    // para um arquivo que não existe mais.
    await apagarArquivoSeOrfao(img.url, async () => {
      const [outraImagem, arte] = await Promise.all([
        prisma.raffleImage.count({ where: { url: img.url } }),
        prisma.skinArt.count({ where: { url: img.url } }),
      ]);
      return outraImagem + arte > 0;
    });

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
      tenantId,
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
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = setCoverSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    const tenantId = await assertRaffleInActiveTenant(
      parsed.data.raffleId,
      session.user,
    );

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
      tenantId,
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
      "URL deve começar com http:// ou https://",
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
            "URL da imagem deve começar com http:// ou https://",
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
            "O link de inspeção deve começar com http:// ou https://",
          ),
      }),
    )
    .max(10, "Máximo de 10 prêmios"),
});

export async function setRafflePrizesAction(
  raw: unknown,
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
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

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
      tenantId,
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
  // Datas vao como texto do <input type="datetime-local">, que nao tem fuso.
  // O servidor interpreta no fuso do servidor, que e o mesmo criterio usado
  // depois para decidir se a promocao vale.
  doubleFrom: z.string().optional().nullable(),
  doubleUntil: z.string().optional().nullable(),
  accumulative: z.boolean().default(false),
  promotions: z
    .array(
      z.object({
        quantity: z.coerce.number().int().min(1).max(10_000_000),
        price: z.coerce.number().min(0).max(99_999_999.99),
        label: z.string().max(60).optional().nullable(),
        type: z.enum(["QTY", "MORE_THAN"]).default("QTY"),
      }),
    )
    .max(20, "Máximo de 20 promoções"),
});

// Escolha de gateway pra um sorteio específico. null = herda o padrão do
// tenant. Credenciais não passam por aqui, só a escolha do provider.
const paymentProviderSchema = z.object({
  raffleId: z.string().cuid(),
  paymentProvider: z
    .enum(["SYNCPAY", "CODEPAY", "SIGILOPAY", "NEXUSPAG"])
    .nullable(),
});

export async function setRafflePaymentProviderAction(
  raw: unknown,
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
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    await prisma.raffle.update({
      where: { id: raffleId },
      data: { paymentProvider },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
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
  raw: unknown,
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
    const {
      raffleId,
      promotions,
      enabled,
      doubleEnabled,
      doubleFrom,
      doubleUntil,
      accumulative,
    } = parsed.data;
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    // O comeco da promocao existe para a BARRA poder ser honesta: sem ele nao
    // existe "quanto ja passou", so "quanto falta", e a barra viraria chute.
    // Quando o admin liga sem informar data, o instante de ligar vira o
    // comeco. Salvar de novo depois nao reinicia a barra: so o primeiro
    // "ligar" grava, e mexer na data continua sendo escolha explicita dele.
    const atual = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { promotionsDoubleFrom: true, promotionsDoubleEnabled: true },
    });
    const inicioDaPromocao = !doubleEnabled
      ? null
      : doubleFrom
        ? dataDeSaoPauloParaUtc(doubleFrom)
        : atual?.promotionsDoubleEnabled && atual.promotionsDoubleFrom
          ? atual.promotionsDoubleFrom
          : new Date();

    await prisma.$transaction([
      prisma.raffle.update({
        where: { id: raffleId },
        data: {
          promotionsEnabled: enabled,
          promotionsDoubleEnabled: doubleEnabled,
          promotionsDoubleFrom: inicioDaPromocao,
          promotionsDoubleUntil: doubleUntil
            ? dataDeSaoPauloParaUtc(doubleUntil)
            : null,
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
      tenantId,
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
        // Condições para o número pagar. Viajam com o item porque esta ação
        // APAGA e recria a lista inteira: sem elas aqui, todo salvamento da
        // aba limparia as condições em silêncio.
        saidaTitulosDe: z.coerce.number().int().min(1).optional().nullable(),
        saidaTitulosAte: z.coerce.number().int().min(1).optional().nullable(),
        saidaDataDe: z.string().optional().nullable(),
        saidaDataAte: z.string().optional().nullable(),
        saidaDdds: z.array(z.string().regex(/^\d{2}$/)).default([]),
      }),
    )
    .max(500, "Máximo de 500 títulos premiados por sorteio"),
});

export async function setRaffleAwardedTicketsAction(
  raw: unknown,
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
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    // Valida limite: números devem estar dentro do intervalo da rifa.
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { totalNumbers: true, tenantId: true },
    });
    if (!raffle) {
      return { ok: false, error: "Sorteio não encontrado" };
    }
    const out = items.filter(
      (i) => i.number < 1 || i.number > raffle.totalNumbers,
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
    const dedupe = new Map<number, (typeof items)[number]>();
    for (const i of items) dedupe.set(i.number, i);

    // A raridade sai do NOME, conferido contra o catálogo de skins do tenant,
    // e não de uma escolha guardada no formulário. É o que faz a colagem em
    // massa ("número, prêmio" por linha) ganhar cor sem trabalho nenhum, e o
    // que impede a cor de ficar velha quando alguém edita o texto depois.
    // Prêmio que não é skin simplesmente não casa e fica sem cor, que é o
    // caso normal de "R$ 500 no Pix".
    const catalogo = new Map<string, SkinRarity | null>();
    for (const skin of await prisma.skinTemplate.findMany({
      where: { tenantId: raffle.tenantId },
      select: { name: true, skinRarity: true },
    })) {
      catalogo.set(chaveDoNome(skin.name), skin.skinRarity);
    }

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
        data: [...dedupe.values()].map((i) => ({
          raffleId,
          number: i.number,
          prizeDescription: i.prizeDescription,
          skinRarity: raridadeDoPremio(i.prizeDescription, catalogo),
          isInstantPrize: true,
          saidaTitulosDe: i.saidaTitulosDe ?? null,
          saidaTitulosAte: i.saidaTitulosAte ?? null,
          saidaDataDe: i.saidaDataDe ? new Date(i.saidaDataDe) : null,
          saidaDataAte: i.saidaDataAte ? new Date(i.saidaDataAte) : null,
          saidaDdds: i.saidaDdds,
        })),
      }),
    ]);

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "títulos premiados" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/editar`);
    revalidatePath("/[slug]", "page");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[setRaffleAwardedTicketsAction]", err);
    return { ok: false, error: "Erro ao salvar títulos premiados" };
  }
}

const sorteioDeTitulosSchema = z.object({
  raffleId: z.string().cuid(),
  quantidade: z.number().int().min(1).max(50),
  /** Números que já estão na lista da tela, salvos ou não. */
  evitar: z.array(z.number().int().positive()).max(500).default([]),
});

/**
 * Sorteia títulos premiados entre os que AINDA ESTÃO À VENDA.
 *
 * Precisa ser no servidor porque a resposta mora no banco: quais números já
 * têm dono. O botão antigo sorteava no navegador, em 1..total, sabendo apenas
 * o que estava na própria tela. Numa campanha com metade vendida, metade dos
 * sorteios caía em número já comprado, e um título premiado nesse número não
 * paga ninguém: a marcação acontece quando o pagamento entra, e o pagamento
 * daquele número já entrou.
 *
 * Devolve junto quantos títulos restam livres, que é o número que a tela
 * mostra: sem ele, o admin só descobre que a campanha acabou quando o sorteio
 * volta vazio.
 */
export async function sortearTitulosPremiadosAction(
  raw: unknown,
): Promise<
  ActionResult<{ numeros: number[]; disponiveis: number; pedidos: number }>
> {
  try {
    const session = await getAdminOrThrow();
    const parsed = sorteioDeTitulosSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }
    const { raffleId, quantidade, evitar } = parsed.data;
    await assertRaffleInActiveTenant(raffleId, session.user);

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { totalNumbers: true },
    });
    if (!raffle) return { ok: false, error: "Sorteio não encontrado" };

    // Reserva vencida devolve os números dela, e o que faz isso acontecer é
    // esta chamada: sem ela, um carrinho abandonado ontem ainda bloquearia o
    // título hoje.
    await expireForRaffle(raffleId);

    const numeros = await sortearTitulosLivres({
      total: raffle.totalNumbers,
      quantidade,
      evitar: new Set(evitar),
      consulta: {
        async ocupadosEntre(candidatos) {
          const linhas = await prisma.ticket.findMany({
            where: { raffleId, number: { in: candidatos } },
            select: { number: true },
          });
          return new Set(linhas.map((l) => l.number));
        },
        async livresVarrendo(limite) {
          const donos = new Set(
            (
              await prisma.ticket.findMany({
                where: { raffleId },
                select: { number: true },
              })
            ).map((l) => l.number),
          );
          const livres: number[] = [];
          for (
            let n = 1;
            n <= raffle.totalNumbers && livres.length < limite;
            n++
          ) {
            if (!donos.has(n)) livres.push(n);
          }
          return livres;
        },
      },
    });

    const ocupados = await contarOcupados(raffleId);
    return {
      ok: true,
      data: {
        numeros,
        disponiveis: Math.max(0, raffle.totalNumbers - ocupados),
        pedidos: quantidade,
      },
    };
  } catch (err) {
    console.error("[sortearTitulosPremiadosAction]", err);
    return { ok: false, error: "Erro ao sortear títulos disponíveis" };
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
      }),
    )
    .max(20, "Máximo de 20 combos"),
});

// Substitui a lista inteira a cada save (mesmo padrão de Promotion/Prize).
// Dedup por threshold, combos com mesma quantidade colidem no @@unique.
export async function setRaffleSurpriseBoxCombosAction(
  raw: unknown,
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
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

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
      tenantId,
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
  raw: unknown,
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
    const { raffleId, title, prize, quantity, mode, odds, locked } =
      parsed.data;
    // O tenant vem da própria checagem, que passou a devolvê-lo: buscar o
    // sorteio outra vez só para ler o tenantId seria a mesma consulta duas
    // vezes.
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    // Mesma regra dos Títulos Premiados: a raridade sai do nome conferido
    // contra o catálogo, e prêmio que não é skin fica sem cor.
    const skinRarity = raridadeDoPremio(
      prize.trim(),
      new Map(
        (
          await prisma.skinTemplate.findMany({
            where: { tenantId },
            select: { name: true, skinRarity: true },
          })
        ).map((sk) => [chaveDoNome(sk.name), sk.skinRarity]),
      ),
    );

    // O PONTO DE SAÍDA JÁ NASCE COM O PRÊMIO.
    //
    // Antes o prêmio entrava no bolo e ninguém sabia quando ele apareceria.
    // Agora cada unidade recebe um ponto, calculado a partir de onde a venda
    // está: campanha parada agenda cedo, campanha adiantada agenda
    // proporcional ao que ainda falta vender.
    //
    // Cada unidade puxa a anterior, e é isso que faz elas saírem uma atrás da
    // outra em vez de todas caírem no mesmo ponto. Por isso o loop acumula, em
    // vez de calcular as N de uma vez.
    const [vendidos, ultimo, campanha] = await Promise.all([
      prisma.ticket.count({ where: { raffleId, status: "PAID" } }),
      prisma.surpriseBoxPrize.findFirst({
        where: { raffleId, saidaEmTitulos: { not: null } },
        orderBy: { saidaEmTitulos: "desc" },
        select: { saidaEmTitulos: true },
      }),
      prisma.raffle.findUnique({
        where: { id: raffleId },
        select: { totalNumbers: true },
      }),
    ]);
    const total = campanha?.totalNumbers ?? 0;
    let ultimoAgendado = ultimo?.saidaEmTitulos ?? null;

    const linhas = Array.from({ length: quantity }, () => {
      const ponto = agendarSaida({ vendidos, total, ultimoAgendado });
      ultimoAgendado = ponto;
      return {
        raffleId,
        title: title.trim(),
        prize: prize.trim(),
        skinRarity,
        mode,
        // Em RANDOM zera odds; em PERCENT usa o valor (NULL se admin não passou).
        odds: mode === "PERCENT" && odds != null ? odds : null,
        locked,
        saidaEmTitulos: ponto,
      };
    });

    const result = await prisma.surpriseBoxPrize.createMany({ data: linhas });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
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
  raw: unknown,
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
    const tenantId = await assertRaffleInActiveTenant(
      prize.raffleId,
      session.user,
    );
    if (prize.claimedAt) {
      return {
        ok: false,
        error: "Prêmio já foi sorteado, não pode ser bloqueado",
      };
    }

    await prisma.surpriseBoxPrize.update({
      where: { id: parsed.data.prizeId },
      data: { locked: !prize.locked },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
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

const editarPremioDeCaixaSchema = z.object({
  // O painel agrupa as unidades iguais numa linha só, então editar vale para
  // o grupo: renomear uma de cem unidades deixaria noventa e nove com o nome
  // velho e a linha se partiria em duas.
  prizeIds: z.array(z.string().cuid()).min(1).max(500),
  title: z.string().min(1).max(120),
  prize: z.string().min(1).max(200),
});

/**
 * Renomeia o prêmio, inclusive o que já foi sorteado.
 *
 * Sorteado é justamente o caso que mais precisa: um nome errado que já saiu
 * para alguém é o que o ganhador está lendo, e antes não havia como corrigir.
 * Renomear não mexe em quem ganhou nem em quando: só no texto e na raridade
 * que sai dele.
 */
export async function updateSurpriseBoxPrizeAction(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = editarPremioDeCaixaSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    const { prizeIds, title, prize } = parsed.data;

    const premios = await prisma.surpriseBoxPrize.findMany({
      where: { id: { in: prizeIds } },
      select: { id: true, raffleId: true },
    });
    if (premios.length === 0)
      return { ok: false, error: "Prêmio não encontrado" };

    // Todas as unidades têm de ser do mesmo sorteio: sem isto, uma lista
    // montada à mão editaria prêmio de outra campanha do mesmo tenant.
    const raffleId = premios[0]!.raffleId;
    if (premios.some((p) => p.raffleId !== raffleId)) {
      return { ok: false, error: "Dados inválidos" };
    }
    await assertRaffleInActiveTenant(raffleId, session.user);

    const raffle = await prisma.raffle.findUniqueOrThrow({
      where: { id: raffleId },
      select: { tenantId: true },
    });
    const skinRarity = raridadeDoPremio(
      prize.trim(),
      new Map(
        (
          await prisma.skinTemplate.findMany({
            where: { tenantId: raffle.tenantId },
            select: { name: true, skinRarity: true },
          })
        ).map((sk) => [chaveDoNome(sk.name), sk.skinRarity]),
      ),
    );

    await prisma.surpriseBoxPrize.updateMany({
      where: { id: { in: premios.map((p) => p.id) } },
      data: { title: title.trim(), prize: prize.trim(), skinRarity },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/compras`);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[updateSurpriseBoxPrizeAction]", err);
    return { ok: false, error: "Erro ao editar prêmio" };
  }
}

const caixaIdSchema = z.object({ boxId: z.string().cuid() });

/**
 * Desfaz uma caixa já aberta: apaga a caixa e devolve o prêmio ao pool.
 *
 * Devolver, e não apagar junto, porque são duas decisões diferentes. Aqui o
 * que se desfaz é a premiação; o prêmio volta a ficar disponível e, se a
 * intenção era sumir com ele também, é um clique na lista de cadastrados, que
 * é onde apagar prêmio sempre morou.
 */
export async function deleteSurpriseBoxAction(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = caixaIdSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };

    const box = await prisma.surpriseBox.findUnique({
      where: { id: parsed.data.boxId },
      select: { raffleId: true, prizeId: true },
    });
    if (!box) return { ok: false, error: "Caixa não encontrada" };
    await assertRaffleInActiveTenant(box.raffleId, session.user);

    // Numa transação: apagar a caixa sem soltar o prêmio deixaria um item
    // marcado como sorteado e sem dono, fora do pool para sempre.
    await prisma.$transaction([
      ...(box.prizeId
        ? [
            prisma.surpriseBoxPrize.update({
              where: { id: box.prizeId },
              data: { claimedAt: null },
            }),
          ]
        : []),
      prisma.surpriseBox.delete({ where: { id: parsed.data.boxId } }),
    ]);

    revalidatePath(`/admin/sorteios/${box.raffleId}/compras`);
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[deleteSurpriseBoxAction]", err);
    return { ok: false, error: "Erro ao remover caixa" };
  }
}

// Remove um prêmio do pool. Prêmio já sorteado (claimedAt setado) não
// pode ser deletado, preserva histórico do ganhador.
export async function deleteSurpriseBoxPrizeAction(
  raw: unknown,
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
    const tenantId = await assertRaffleInActiveTenant(
      prize.raffleId,
      session.user,
    );
    if (prize.claimedAt) {
      return {
        ok: false,
        error: "Prêmio já foi sorteado, não pode ser excluído",
      };
    }

    await prisma.surpriseBoxPrize.delete({
      where: { id: parsed.data.prizeId },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
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
  raw: unknown,
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
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    // Campanha com sorteio ao vivo não aceita ganhador digitado. O resultado
    // dela é decidido pelo servidor, com carimbo de hora e impressão digital
    // do universo sorteado, e deixar o painel sobrescrever isso apagaria a
    // única coisa que dá valor ao comprovante público. O caminho manual
    // continua valendo para campanha sem sorteio automático (Loteria Federal,
    // sorteio gravado em vídeo, resultado antigo).
    const sorteio = await prisma.draw.findUnique({
      where: { raffleId },
      select: { publicId: true, status: true },
    });
    if (sorteio) {
      return {
        ok: false,
        error: `Esta campanha tem sorteio automático (${sorteio.publicId}). O ganhador é definido pelo sistema e não pode ser digitado.`,
      };
    }

    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { totalNumbers: true, tenantId: true },
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
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { numero: ticketNumber },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/compras`);
    revalidatePath(`/admin/sorteios`);
    revalidatePath(`/sorteios`);
    // O slug muda por tenant, então invalida a rota dinâmica inteira em vez
    // de um caminho só. Antes isto era revalidatePath(`/s/`), que apontava
    // para um caminho que nunca foi uma página: não invalidava nada.
    revalidatePath("/[slug]", "page");

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
  raw: unknown,
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = clearWinnerSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    const tenantId = await assertRaffleInActiveTenant(
      parsed.data.raffleId,
      session.user,
    );

    // Mesma trava do lado de cá: apagar o ganhador de um sorteio automático
    // reabriria para venda uma campanha cujo resultado já foi transmitido e
    // certificado em público.
    const sorteio = await prisma.draw.findUnique({
      where: { raffleId: parsed.data.raffleId },
      select: { publicId: true },
    });
    if (sorteio) {
      return {
        ok: false,
        error: `O resultado do sorteio ${sorteio.publicId} é definitivo e não pode ser removido.`,
      };
    }

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
      tenantId,
      alvo: { tipo: "Raffle", id: parsed.data.raffleId },
    });

    revalidatePath(`/admin/sorteios/${parsed.data.raffleId}/compras`);
    revalidatePath(`/admin/sorteios`);
    revalidatePath(`/sorteios`);
    revalidatePath("/[slug]", "page");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[clearRaffleWinnerAction]", err);
    return { ok: false, error: "Erro ao limpar ganhador" };
  }
}

const saidaDoPremioSchema = z.object({
  prizeId: z.string().min(1),
  tipoDeSaida: z.enum(["PROGRESSO", "PERSONALIZADO"]),
  /** 0 a 100. Convertida em título no servidor, que é onde fica gravado. */
  porcentagem: z.coerce.number().min(0).max(100).optional().nullable(),
  titulosDe: z.coerce.number().int().min(1).optional().nullable(),
  titulosAte: z.coerce.number().int().min(1).optional().nullable(),
  dataDe: z.string().optional().nullable(),
  dataAte: z.string().optional().nullable(),
  ddds: z.array(z.string().regex(/^\d{2}$/)).default([]),
});

/**
 * Configurações de saída de UMA unidade de prêmio.
 *
 * Uma unidade, e não o grupo: cada uma tem o seu ponto, elas saem uma atrás da
 * outra, e mudar as quatro de uma vez faria as quatro caírem juntas.
 *
 * A tela fala em porcentagem porque é como se pensa a campanha; o banco guarda
 * o título. A conta é feita aqui, com o total da campanha em mãos, e não no
 * navegador, onde um total desatualizado gravaria o ponto errado.
 */
export async function salvarSaidaDoPremioAction(
  raw: unknown,
): Promise<ActionResult<{ saidaEmTitulos: number | null }>> {
  try {
    const session = await getAdminOrThrow();
    const parsed = saidaDoPremioSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }
    const d = parsed.data;

    const premio = await prisma.surpriseBoxPrize.findUnique({
      where: { id: d.prizeId },
      select: { raffleId: true, claimedAt: true },
    });
    if (!premio) return { ok: false, error: "Prêmio não encontrado" };
    const tenantId = await assertRaffleInActiveTenant(
      premio.raffleId,
      session.user,
    );
    if (premio.claimedAt) {
      return { ok: false, error: "Prêmio já saiu, não dá para reagendar" };
    }

    const campanha = await prisma.raffle.findUnique({
      where: { id: premio.raffleId },
      select: { totalNumbers: true },
    });
    const total = campanha?.totalNumbers ?? 0;

    // Faixa invertida é engano de digitação, e gravada ela cria um prêmio que
    // nunca sai: nenhuma compra cabe entre 100 e 10.
    if (
      d.tipoDeSaida === "PERSONALIZADO" &&
      d.titulosDe != null &&
      d.titulosAte != null &&
      d.titulosDe > d.titulosAte
    ) {
      return { ok: false, error: "A faixa de títulos está invertida." };
    }
    const de = d.dataDe ? new Date(d.dataDe) : null;
    const ate = d.dataAte ? new Date(d.dataAte) : null;
    if (de && ate && de > ate) {
      return { ok: false, error: "A janela de datas está invertida." };
    }

    // Arredonda para cima e nunca para zero: título 0 não existe, e um ponto
    // em zero sairia na próxima caixa, que não é o que "0,5%" quer dizer.
    const emTitulos =
      d.tipoDeSaida === "PROGRESSO" && d.porcentagem != null && total > 0
        ? Math.min(total, Math.max(1, Math.ceil((d.porcentagem / 100) * total)))
        : null;

    await prisma.surpriseBoxPrize.update({
      where: { id: d.prizeId },
      data: {
        tipoDeSaida: d.tipoDeSaida,
        saidaEmTitulos: emTitulos,
        // Cada tipo limpa o que é do outro: deixar resto gravado faria a
        // condição antiga voltar a valer numa troca de tipo futura.
        saidaTitulosDe: d.tipoDeSaida === "PERSONALIZADO" ? d.titulosDe : null,
        saidaTitulosAte:
          d.tipoDeSaida === "PERSONALIZADO" ? d.titulosAte : null,
        saidaDataDe: d.tipoDeSaida === "PERSONALIZADO" ? de : null,
        saidaDataAte: d.tipoDeSaida === "PERSONALIZADO" ? ate : null,
        saidaDdds: d.tipoDeSaida === "PERSONALIZADO" ? d.ddds : [],
      },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: premio.raffleId },
      detalhes: { o_que: "saída de prêmio da caixa", tipo: d.tipoDeSaida },
    });

    revalidatePath(`/admin/sorteios/${premio.raffleId}/compras`);
    return { ok: true, data: { saidaEmTitulos: emTitulos } };
  } catch (err) {
    console.error("[salvarSaidaDoPremioAction]", err);
    return { ok: false, error: "Erro ao salvar a saída" };
  }
}

/**
 * O troféu que aparece ao lado de "Número sorteado" na tela do sorteio.
 *
 * É por campanha: cada sorteio pode ter o seu, e sorteio sem troféu não
 * desenha nada (nem espaço reservado, nem imagem padrão). Guarda só a URL,
 * pelo mesmo caminho de upload das outras imagens; passar `null` remove.
 */
export async function setRaffleTrofeuAction(
  formData: FormData,
): Promise<ActionResult<{ url: string | null }>> {
  try {
    const session = await getAdminOrThrow();

    const raffleId = formData.get("raffleId");
    if (typeof raffleId !== "string" || !raffleId) {
      return { ok: false, error: "raffleId obrigatório" };
    }
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    const file = formData.get("file");
    const remover = formData.get("remover") === "1";

    let url: string | null = null;
    if (!remover) {
      if (!isStorageConfigured()) {
        return {
          ok: false,
          error:
            "Supabase Storage não está configurado. Defina as variáveis NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET.",
        };
      }
      if (!(file instanceof File)) {
        return { ok: false, error: "Arquivo inválido" };
      }
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
      url = (await uploadRaffleImage(raffleId, file)).url;
    }

    await prisma.raffle.update({
      where: { id: raffleId },
      data: { trofeuUrl: url },
    });

    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: url ? "troféu definido" : "troféu removido" },
    });

    revalidatePath(`/admin/sorteios/${raffleId}/editar`);
    revalidatePath(`/admin/sorteios/${raffleId}/sorteio`);
    return { ok: true, data: { url } };
  } catch (err) {
    console.error("[setRaffleTrofeuAction]", err);
    const msg = err instanceof Error ? err.message : "Erro no upload";
    return { ok: false, error: msg };
  }
}
