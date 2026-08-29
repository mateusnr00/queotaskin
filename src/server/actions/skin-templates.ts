"use server";

// Catálogo de skins do tenant.
//
// Abrir campanha da mesma faca duas vezes obrigava a redigitar a ficha
// inteira e reenviar a mesma imagem. Aqui a skin é cadastrada uma vez; na
// criação do sorteio ela vira prêmio e capa de uma vez só.

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { WEARS_EM_ORDEM } from "@/lib/cs2";
import type { SkinWear } from "@prisma/client";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import type { ActionResult } from "@/server/actions/auth";
import { isStorageConfigured, uploadRaffleImage } from "@/lib/storage";
import { MAX_IMAGE_BYTES } from "@/lib/raffle-images";
import { registrarLog } from "@/server/services/activity-log";

// Qualquer image/* passa, com a extensão como segunda pista: o navegador nem
// sempre preenche file.type.
const IMAGEM_EXT =
  /\.(png|jpe?g|webp|gif|avif|bmp|heic|heif|svg|tiff?|ico|jfif)$/i;

const RARIDADES = [
  "CONSUMER",
  "INDUSTRIAL",
  "MIL_SPEC",
  "RESTRICTED",
  "CLASSIFIED",
  "COVERT",
  "CONTRABAND",
  "EXTRAORDINARY",
] as const;

const DESGASTES = [
  "FACTORY_NEW",
  "MINIMAL_WEAR",
  "FIELD_TESTED",
  "WELL_WORN",
  "BATTLE_SCARRED",
] as const;

const vazioViraNulo = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

const skinSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(140),
  imageUrl: vazioViraNulo(z.string().url("URL inválida").max(2048)),
  skinRarity: vazioViraNulo(z.enum(RARIDADES)),
  skinWear: vazioViraNulo(z.enum(DESGASTES)),
  // O float do CS2 vai de 0 a 1; fora disso é digitação errada.
  skinFloat: vazioViraNulo(z.coerce.number().min(0).max(1)),
  skinStatTrak: z.coerce.boolean().default(false),
  skinSouvenir: z.coerce.boolean().default(false),
  skinValueBrl: vazioViraNulo(z.coerce.number().min(0).max(9_999_999)),
  skinCollection: vazioViraNulo(z.string().trim().max(140)),
  // Allow-list de protocolo: o link de inspeção vira um href público
  // (skin-card.tsx). .url() aceitaria javascript:… (URL válida), então a
  // checagem é pelo esquema http/https, não por .url().
  skinInspectUrl: vazioViraNulo(
    z
      .string()
      .trim()
      .max(2048)
      .refine(
        (v) => v.startsWith("http://") || v.startsWith("https://"),
        "O link de inspeção deve começar com http:// ou https://"
      )
  ),
});

export type SkinTemplateInput = z.input<typeof skinSchema>;

function erroDeNomeRepetido(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function criarSkinAction(
  raw: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = skinSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const skin = await prisma.skinTemplate.create({
      // Skin cadastrada à mão nasce existindo nos cinco desgastes. É o
      // palpite certo: skin com faixa de float restrita é minoria, e a lista
      // só existe para não oferecer o que não existe. Vazia aqui esconderia a
      // escolha do desgaste na criação do sorteio, que é justamente o que
      // esta lista veio destravar. Quem importa do CS2 recebe a lista real.
      data: { ...parsed.data, skinWears: WEARS_EM_ORDEM, tenantId },
      select: { id: true },
    });

    // O select acima só traz o id; o nome usado no rótulo é o mesmo que acaba
    // de virar skin.name, então parsed.data.name evita um select a mais.
    await registrarLog({
      acao: "skin.alterada",
      tenantId,
      alvo: { tipo: "SkinTemplate", id: skin.id, rotulo: parsed.data.name },
      detalhes: { o_que: "criada" },
    });

    revalidatePath("/admin/skins");
    return { ok: true, data: skin };
  } catch (err) {
    if (erroDeNomeRepetido(err)) {
      return { ok: false, error: "Já existe uma skin com esse nome" };
    }
    console.error("[criarSkinAction]", err);
    return { ok: false, error: "Erro ao salvar a skin" };
  }
}

export async function atualizarSkinAction(
  id: string,
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = skinSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    // updateMany com o tenant no filtro: um id de outro tenant não encontra
    // linha e sai com count 0, em vez de editar o que não é dele.
    const { count } = await prisma.skinTemplate.updateMany({
      where: { id, tenantId },
      data: parsed.data,
    });
    if (count === 0) return { ok: false, error: "Skin não encontrada" };

    await registrarLog({
      acao: "skin.alterada",
      tenantId,
      alvo: { tipo: "SkinTemplate", id, rotulo: parsed.data.name },
      detalhes: { o_que: "editada" },
    });

    revalidatePath("/admin/skins");
    return { ok: true, data: undefined };
  } catch (err) {
    if (erroDeNomeRepetido(err)) {
      return { ok: false, error: "Já existe uma skin com esse nome" };
    }
    console.error("[atualizarSkinAction]", err);
    return { ok: false, error: "Erro ao salvar a skin" };
  }
}

export async function removerSkinAction(id: string): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    // Carrega o nome antes de apagar: depois do delete a linha some do banco,
    // e "skin removida" sem dizer qual não ajuda quem lê o histórico depois.
    const existente = await prisma.skinTemplate.findFirst({
      where: { id, tenantId },
      select: { name: true },
    });

    const { count } = await prisma.skinTemplate.deleteMany({
      where: { id, tenantId },
    });
    if (count === 0) return { ok: false, error: "Skin não encontrada" };

    await registrarLog({
      acao: "skin.alterada",
      tenantId,
      alvo: { tipo: "SkinTemplate", id, rotulo: existente?.name ?? null },
      detalhes: { o_que: "removida" },
    });

    revalidatePath("/admin/skins");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[removerSkinAction]", err);
    return { ok: false, error: "Erro ao remover a skin" };
  }
}

/**
 * Sobe a foto de uma skin e devolve a URL, sem gravar em lugar nenhum.
 *
 * Existe separada de uploadLogoAction de propósito: aquela escreve a URL no
 * Tenant, e um slot desconhecido cai no "logo". Reaproveitá-la aqui trocaria
 * a logo do site a cada foto de skin enviada.
 *
 * Quem grava a URL é o formulário, ao salvar a skin. O arquivo fica no
 * Storage mesmo se a pessoa desistir do cadastro; é lixo barato, e o
 * contrário (apagar no cancelamento) perderia a foto de quem só fechou a
 * aba sem querer.
 */
export async function uploadFotoDaSkinAction(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  try {
    const session = await getAdminOrThrow();
    // Escopo de tenant + host-binding do painel: sem isto, qualquer admin de
    // qualquer tenant subia arquivo pelo host público. getActiveTenantIdForAdmin
    // recusa quando o host não é o do painel.
    await getActiveTenantIdForAdmin(session.user);

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
    if (!file.type.startsWith("image/") && !IMAGEM_EXT.test(file.name)) {
      return { ok: false, error: "O arquivo não parece ser uma imagem" };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: "Imagem grande demais para enviar. Tente uma menor",
      };
    }

    const { url } = await uploadRaffleImage("skins", file);
    return { ok: true, data: { url } };
  } catch (err) {
    console.error("[uploadFotoDaSkinAction]", err);
    return { ok: false, error: "Erro ao enviar a foto" };
  }
}

/**
 * Guarda a arte de campanha de uma skin, para um desgaste ou para todos.
 *
 * A arte é o que vira a capa do sorteio quando essa skin é escolhida no
 * catálogo. Não se confunde com a foto: a foto é o render do jogo e continua
 * sendo o que aparece em "Ver as skins premiadas".
 *
 * `wear` nulo é a arte que vale para qualquer desgaste, usada só quando não
 * existe uma específica. Reenviar para o mesmo par troca a que estava lá, que
 * é o que se espera de "trocar a arte".
 */
export async function salvarArteDaSkinAction(
  skinTemplateId: string,
  wear: SkinWear | null,
  url: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    // A skin tem de ser deste tenant: sem esta checagem, o id de outro tenant
    // ganharia arte pelo painel de quem não é dono dela.
    const skin = await prisma.skinTemplate.findFirst({
      where: { id: skinTemplateId, tenantId },
      select: { id: true },
    });
    if (!skin) return { ok: false, error: "Skin não encontrada" };

    // O par (skin, desgaste) tem única, mas com wear nulo o upsert do Prisma
    // não alcança: NULL não casa em where composto. Por isso os dois caminhos.
    const existente = await prisma.skinArt.findFirst({
      where: { skinTemplateId, wear },
      select: { id: true },
    });
    const arte = existente
      ? await prisma.skinArt.update({
          where: { id: existente.id },
          data: { url },
          select: { id: true },
        })
      : await prisma.skinArt.create({
          data: { skinTemplateId, wear, url },
          select: { id: true },
        });

    revalidatePath("/admin/skins");
    return { ok: true, data: arte };
  } catch (err) {
    console.error("[salvarArteDaSkinAction]", err);
    return { ok: false, error: "Erro ao salvar a arte" };
  }
}

/** Tira a arte. O arquivo fica no Storage; é lixo barato e reversível. */
export async function removerArteDaSkinAction(
  id: string
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const arte = await prisma.skinArt.findFirst({
      where: { id, skin: { tenantId } },
      select: { id: true },
    });
    if (!arte) return { ok: false, error: "Arte não encontrada" };

    await prisma.skinArt.delete({ where: { id: arte.id } });
    revalidatePath("/admin/skins");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[removerArteDaSkinAction]", err);
    return { ok: false, error: "Erro ao remover a arte" };
  }
}
