"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import {
  deleteRaffleImage,
  isStorageConfigured,
  pathFromPublicUrl,
} from "@/lib/storage";
import { raffleGeneralSchema } from "@/lib/validations/raffle";
import { generateUniqueSlug } from "@/server/services/raffles";
import type { ActionResult } from "@/server/actions/auth";

const updateInputSchema = z.object({
  id: z.string().cuid(),
  data: raffleGeneralSchema,
});

const statusUpdateSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(["DRAFT", "ACTIVE", "FINISHED", "CANCELLED"]),
});

const highlightUpdateSchema = z.object({
  id: z.string().cuid(),
  showOnHome: z.boolean(),
});

export async function createRaffleAction(
  raw: unknown
): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = raffleGeneralSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    // Se admin forneceu um slug, usa esse (após validar unicidade);
    // senão gera a partir do título. Unicidade é por tenant.
    const { slug: providedSlug, ...rest } = parsed.data;
    const slug = providedSlug
      ? providedSlug
      : await generateUniqueSlug(parsed.data.title, tenantId);

    try {
      const raffle = await prisma.raffle.create({
        data: {
          ...rest,
          slug,
          createdById: session.user.id,
          tenantId,
        },
        select: { id: true, slug: true },
      });

      revalidatePath("/admin/sorteios");
      revalidatePath("/sorteios");
      revalidatePath("/");

      return { ok: true, data: raffle };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return {
          ok: false,
          error: "URL amigável já está em uso. Escolha outra.",
          fieldErrors: { slug: ["Já está em uso"] },
        };
      }
      throw err;
    }
  } catch (err) {
    console.error("[createRaffleAction]", err);
    return { ok: false, error: "Erro ao criar sorteio" };
  }
}

export async function updateRaffleAction(
  raw: unknown
): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = updateInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    // Separa slug do resto. Se vazio, mantém o atual (não muda).
    const { slug, ...rest } = parsed.data.data;
    const data: Prisma.RaffleUpdateInput = {
      ...rest,
      ...(slug ? { slug } : {}),
    };

    // Invalida a página da rifa antiga antes de mudar (slug muda → URL muda).
    // Também valida que a rifa pertence ao tenant atual.
    const oldRaffle = await prisma.raffle.findUnique({
      where: { id: parsed.data.id },
      select: { slug: true, tenantId: true },
    });
    if (!oldRaffle) {
      return { ok: false, error: "Sorteio não encontrado" };
    }
    if (oldRaffle.tenantId !== tenantId) {
      return { ok: false, error: "Permissão negada" };
    }

    try {
      const raffle = await prisma.raffle.update({
        where: { id: parsed.data.id },
        data,
        select: { id: true, slug: true },
      });

      revalidatePath("/admin/sorteios");
      revalidatePath(`/admin/sorteios/${raffle.id}/editar`);
      revalidatePath(`/s/${raffle.slug}`);
      if (oldRaffle && oldRaffle.slug !== raffle.slug) {
        revalidatePath(`/s/${oldRaffle.slug}`);
      }
      revalidatePath("/sorteios");
      revalidatePath("/");

      return { ok: true, data: raffle };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return {
          ok: false,
          error: "URL amigável já está em uso. Escolha outra.",
          fieldErrors: { slug: ["Já está em uso"] },
        };
      }
      throw err;
    }
  } catch (err) {
    console.error("[updateRaffleAction]", err);
    return { ok: false, error: "Erro ao salvar sorteio" };
  }
}

export async function updateRaffleHighlightAction(
  raw: unknown
): Promise<ActionResult<{ showOnHome: boolean }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = highlightUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }

    // updateMany permite condicionar a alteração ao tenant. Se a rifa não
    // pertence ao tenant, o count vem 0 e devolvemos erro.
    const result = await prisma.raffle.updateMany({
      where: { id: parsed.data.id, tenantId },
      data: { showOnHome: parsed.data.showOnHome },
    });
    if (result.count === 0) {
      return { ok: false, error: "Sorteio não encontrado" };
    }
    const updated = await prisma.raffle.findUniqueOrThrow({
      where: { id: parsed.data.id },
      select: { showOnHome: true },
    });

    revalidatePath("/admin/sorteios");
    revalidatePath("/");
    return { ok: true, data: { showOnHome: updated.showOnHome } };
  } catch (err) {
    console.error("[updateRaffleHighlightAction]", err);
    return { ok: false, error: "Erro ao atualizar destaque" };
  }
}

export async function updateRaffleStatusAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = statusUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }

    const result = await prisma.raffle.updateMany({
      where: { id: parsed.data.id, tenantId },
      data: { status: parsed.data.status },
    });
    if (result.count === 0) {
      return { ok: false, error: "Sorteio não encontrado" };
    }

    revalidatePath("/admin/sorteios");
    revalidatePath("/sorteios");
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[updateRaffleStatusAction]", err);
    return { ok: false, error: "Erro ao atualizar status" };
  }
}

const deleteRaffleSchema = z.object({
  id: z.string().cuid(),
  // Anti-acidente: cliente manda o título atual da rifa pra confirmar
  // que sabe o que está apagando. Comparação case-insensitive e trimada.
  confirmTitle: z.string().min(1),
});

// Exclui permanentemente uma rifa. As FKs em Reservation, Ticket, Prize,
// RaffleImage, Promotion e AwardedTicket têm onDelete: Cascade, então o
// Postgres limpa toda a árvore numa só operação. DiscountLink / UtmLink
// usam SetNull (o link sobrevive, só desvincula).
//
// Antes do DELETE, tentamos limpar as imagens do bucket Supabase
// (best-effort, se falhar, a rifa some do banco mesmo assim e o arquivo
// fica órfão no storage, que é menor mal que bloquear a exclusão).
export async function deleteRaffleAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = deleteRaffleSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }

    const raffle = await prisma.raffle.findUnique({
      where: { id: parsed.data.id },
      select: {
        id: true,
        title: true,
        slug: true,
        tenantId: true,
        images: { select: { url: true } },
      },
    });
    if (!raffle || raffle.tenantId !== tenantId) {
      return { ok: false, error: "Sorteio não encontrado" };
    }

    if (
      raffle.title.trim().toLowerCase() !==
      parsed.data.confirmTitle.trim().toLowerCase()
    ) {
      return {
        ok: false,
        error: "Título de confirmação não confere com o sorteio.",
      };
    }

    if (isStorageConfigured()) {
      for (const img of raffle.images) {
        const path = pathFromPublicUrl(img.url);
        if (path) await deleteRaffleImage(path);
      }
    }

    await prisma.raffle.delete({ where: { id: raffle.id } });

    revalidatePath("/admin/sorteios");
    revalidatePath(`/s/${raffle.slug}`);
    revalidatePath("/sorteios");
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[deleteRaffleAction]", err);
    return { ok: false, error: "Erro ao excluir sorteio" };
  }
}
