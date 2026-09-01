"use server";

// Duplicação de sorteio.
//
// Campanha nova quase nunca é campanha do zero: muda a skin e o preço, e o
// resto (quantidade de números, regras de compra, promoções, textos, gateway)
// repete a anterior. Refazer isso à mão em sete abas é onde erram as
// configurações que ninguém revisa depois.
//
// A cópia leva configuração e conteúdo. NÃO leva nada de venda ou resultado:
// tickets, reservas, caixas surpresa e ganhador ficam para trás. Uma cópia
// que herdasse vendas mostraria números vendidos que ninguém comprou.

import { revalidatePath } from "next/cache";


import { prisma } from "@/lib/db";
import {
  camposObrigatoriosCoerentes,
  type CamposObrigatorios,
} from "@/lib/validations/raffle";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { generateUniqueSlug } from "@/server/services/raffles";
import { registrarLog } from "@/server/services/activity-log";
import type { ActionResult } from "@/server/actions/auth";

/** Copia o objeto sem as chaves indicadas, preservando o tipo do resto. */
function semChaves<T extends object, K extends keyof T>(
  obj: T,
  chaves: readonly K[]
): Omit<T, K> {
  const saida = { ...obj };
  for (const chave of chaves) delete saida[chave];
  return saida;
}

export async function duplicarSorteioAction(
  id: string
): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const original = await prisma.raffle.findFirst({
      where: { id, tenantId },
      include: {
        prizes: { orderBy: { position: "asc" } },
        images: { orderBy: { order: "asc" } },
        promotions: { orderBy: { quantity: "asc" } },
        awardedTickets: { orderBy: { number: "asc" } },
      },
    });
    if (!original) return { ok: false, error: "Sorteio não encontrado" };

    const { prizes, images, promotions, awardedTickets, ...campos } = original;

    // O que NÃO atravessa a cópia, e por quê:
    //
    // id, createdAt, updatedAt: o Prisma gera para a linha nova.
    // slug: precisa ser único; sai um novo do título da cópia.
    // createdById, tenantId: quem duplica vira o autor, no tenant da sessão.
    // winner*: resultado de sorteio que a cópia ainda não teve.
    const NAO_COPIAR = [
      "id",
      "createdAt",
      "updatedAt",
      "createdById",
      "tenantId",
      "slug",
      "winnerTicketNumber",
      "winnerDrawnAt",
      "winnerNote",
    ] as const;

    const config = Object.fromEntries(
      Object.entries(campos).filter(
        ([chave]) => !(NAO_COPIAR as readonly string[]).includes(chave)
      )
    ) as Omit<typeof campos, (typeof NAO_COPIAR)[number]>;

    // A cópia nasce com os campos obrigatórios coerentes, e não com o JSON
    // cru do original: campanha antiga guardava nome/telefone/CPF em false,
    // contra o que o painel mostra, e duplicar propagaria o engano.
    const camposObrigatorios = camposObrigatoriosCoerentes(
      original.requiredFields as Partial<CamposObrigatorios> | null,
    );

    const titulo = `${original.title} (cópia)`;
    const slug = await generateUniqueSlug(titulo, tenantId);

    // Tudo numa transação: uma cópia pela metade, com o sorteio criado mas sem
    // os prêmios, é pior do que nenhuma cópia.
    const nova = await prisma.$transaction(async (tx) => {
      const criada = await tx.raffle.create({
        data: {
          ...config,
          requiredFields: camposObrigatorios,
          title: titulo,
          slug,
          // Rascunho de propósito: a cópia entra fora do ar para ser revisada.
          // Publicar sozinha colocaria à venda uma campanha com o preço e a
          // skin da anterior.
          status: "DRAFT",
          createdById: session.user.id,
          tenantId,
        },
        select: { id: true, slug: true },
      });

      if (prizes.length > 0) {
        await tx.prize.createMany({
          data: prizes.map((premio) => ({
            ...semChaves(premio, ["id", "raffleId"]),
            raffleId: criada.id,
          })),
        });
      }

      if (images.length > 0) {
        // A URL é reaproveitada, não o arquivo: as duas campanhas apontam
        // para a mesma imagem no Storage. Por isso a remoção de imagem apaga
        // só o registro quando o arquivo ainda é usado por outra.
        await tx.raffleImage.createMany({
          data: images.map((imagem) => ({
            ...semChaves(imagem, ["id", "raffleId"]),
            raffleId: criada.id,
          })),
        });
      }

      if (promotions.length > 0) {
        await tx.promotion.createMany({
          data: promotions.map((promo) => ({
            ...semChaves(promo, ["id", "raffleId"]),
            raffleId: criada.id,
          })),
        });
      }

      if (awardedTickets.length > 0) {
        await tx.awardedTicket.createMany({
          data: awardedTickets.map((premiado) => ({
            ...semChaves(premiado, ["id", "raffleId"]),
            raffleId: criada.id,
          })),
        });
      }

      return criada;
    });

    await registrarLog({
      acao: "sorteio.duplicado",
      tenantId,
      alvo: { tipo: "Raffle", id: nova.id, rotulo: titulo },
      detalhes: { origem: { id: original.id, titulo: original.title } },
    });

    revalidatePath("/admin/sorteios");
    return { ok: true, data: nova };
  } catch (err) {
    console.error("[duplicarSorteioAction]", err);
    return { ok: false, error: "Erro ao duplicar o sorteio" };
  }
}
