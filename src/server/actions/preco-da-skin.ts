"use server";

// O preço de referência da skin, para o painel sugerir a cota.
//
// Camada fina: confere quem chama, resolve o painel ativo, deriva o nome de
// mercado A PARTIR DO BANCO e delega ao provider. A regra da fonte mora no
// serviço, porque ela é peça trocável e a tela não pode conhecê-la.
//
// O QUE A TELA MANDA É O ID DA SKIN, NUNCA O PREÇO
//
// Aceitar preço vindo do navegador seria deixar o cliente escolher quanto a
// skin vale. Aceitar o market_hash_name pronto seria quase tão ruim: daria
// para consultar um item e gravar o valor de outro. O que atravessa é o id do
// item do catálogo, e o servidor monta o nome com a mesma regra sempre.
//
// A consulta é sempre daqui, nunca do navegador, também porque a Steam limita
// por IP: com a chamada saindo do cliente, cada admin gastaria o próprio
// limite e o cache do servidor não serviria a ninguém.

import { z } from "zod";
import { SkinWear } from "@prisma/client";

import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import {
  precoDaSkinNoMercado,
  type MotivoDaFalha,
} from "@/server/services/skin-price";

export type PrecoDaSkinResultado =
  | {
      ok: true;
      /** Em reais. O menor anúncio da Steam, ou a mediana quando não há. */
      brl: number;
      medianaBrl: number | null;
      volume: number | null;
      marketHashName: string;
      buscadoEm: string;
      fonte: string;
    }
  | { ok: false; erro: string; motivo?: MotivoDaFalha };

const entrada = z.object({
  skinTemplateId: z.string().cuid(),
  wear: z.nativeEnum(SkinWear).nullable().optional(),
  /** Ignora o cache. É o botão "Atualizar preço" da tela. */
  forcar: z.boolean().optional(),
  /**
   * Quando vem, o preço buscado fica gravado no prêmio deste sorteio.
   *
   * Só na edição, e só por clique: é o único caminho pelo qual o valor de uma
   * campanha que já existe muda. Nada aqui roda sozinho.
   */
  raffleId: z.string().cuid().optional(),
});

export async function precoDaSkinAction(
  raw: unknown,
): Promise<PrecoDaSkinResultado> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = entrada.safeParse(raw);
    if (!parsed.success) {
      // Mensagem específica em vez de "dados inválidos": o caso real é o
      // clique antes de escolher a skin, e "dados inválidos" não diz a
      // ninguém o que fazer a seguir.
      return { ok: false, erro: "Escolha a skin do catálogo antes de buscar o preço." };
    }

    // O tenant entra na busca de propósito: sem ele, um admin poderia sondar
    // o catálogo de outro painel passando um id qualquer.
    const skin = await prisma.skinTemplate.findFirst({
      where: { id: parsed.data.skinTemplateId, tenantId },
      select: {
        name: true,
        skinStatTrak: true,
        skinSouvenir: true,
        skinWear: true,
      },
    });
    if (!skin) return { ok: false, erro: "Skin não encontrada no catálogo." };

    const wear = parsed.data.wear ?? skin.skinWear ?? null;
    const r = await precoDaSkinNoMercado({
      skin,
      wear,
      forcar: parsed.data.forcar,
    });

    if (!r.ok) {
      console.warn(
        `[preco-da-skin] ${r.motivo} em "${skin.name}" (${wear ?? "sem desgaste"})`,
      );
      return { ok: false, erro: r.mensagem, motivo: r.motivo };
    }

    if (parsed.data.raffleId) {
      await gravarNoPremio(parsed.data.raffleId, tenantId, r.preco);
    }

    return {
      ok: true,
      brl: r.preco.lowestPriceBrl,
      medianaBrl: r.preco.medianPriceBrl,
      volume: r.preco.volume,
      marketHashName: r.preco.marketHashName,
      buscadoEm: r.preco.fetchedAt.toISOString(),
      fonte: r.preco.fonte,
    };
  } catch (err) {
    console.error("[precoDaSkinAction]", err);
    return { ok: false, erro: "Erro ao consultar o preço" };
  }
}

/**
 * Grava o preço no prêmio principal do sorteio.
 *
 * O tenant entra no `where` do updateMany: um id de sorteio de outro painel
 * simplesmente não encontra linha, em vez de escrever no prêmio alheio.
 *
 * Mexe só no prêmio de posição 1 que tem skin. Prêmio secundário e prêmio que
 * não é skin ("R$ 500 no Pix") não têm preço de mercado para receber.
 */
async function gravarNoPremio(
  raffleId: string,
  tenantId: string,
  preco: {
    marketHashName: string;
    lowestPriceBrl: number;
    medianPriceBrl: number | null;
    fetchedAt: Date;
  },
) {
  await prisma.prize.updateMany({
    where: {
      raffleId,
      position: 1,
      skinName: { not: null },
      raffle: { tenantId },
    },
    data: {
      skinValueBrl: preco.lowestPriceBrl,
      steamMarketHashName: preco.marketHashName,
      steamMedianPriceBrl: preco.medianPriceBrl,
      steamPriceUpdatedAt: preco.fetchedAt,
    },
  });
}

const porNome = z.object({
  raffleId: z.string().cuid(),
  forcar: z.boolean().optional(),
});

/**
 * O preço a partir do sorteio que já existe, para a tela de edição.
 *
 * Lá não existe seletor de catálogo: o prêmio guarda uma CÓPIA da ficha da
 * skin, não uma referência. O nome do prêmio é o que liga um ao outro, e a
 * ponte é feita aqui dentro, no servidor, e não pelo navegador mandando nome.
 */
export async function precoDaSkinDoSorteioAction(
  raw: unknown,
): Promise<PrecoDaSkinResultado> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = porNome.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, erro: "Este sorteio não tem uma skin para consultar." };
    }

    const premio = await prisma.prize.findFirst({
      where: {
        raffleId: parsed.data.raffleId,
        skinName: { not: null },
        raffle: { tenantId },
      },
      orderBy: { position: "asc" },
      select: {
        skinName: true,
        skinWear: true,
        skinStatTrak: true,
        skinSouvenir: true,
      },
    });
    if (!premio?.skinName) {
      return { ok: false, erro: "Este sorteio não tem uma skin no prêmio." };
    }

    const r = await precoDaSkinNoMercado({
      skin: {
        name: premio.skinName,
        skinStatTrak: premio.skinStatTrak,
        skinSouvenir: premio.skinSouvenir,
      },
      wear: premio.skinWear,
      forcar: parsed.data.forcar,
    });

    if (!r.ok) {
      console.warn(`[preco-da-skin] ${r.motivo} em "${premio.skinName}"`);
      return { ok: false, erro: r.mensagem, motivo: r.motivo };
    }

    await gravarNoPremio(parsed.data.raffleId, tenantId, r.preco);

    return {
      ok: true,
      brl: r.preco.lowestPriceBrl,
      medianaBrl: r.preco.medianPriceBrl,
      volume: r.preco.volume,
      marketHashName: r.preco.marketHashName,
      buscadoEm: r.preco.fetchedAt.toISOString(),
      fonte: r.preco.fonte,
    };
  } catch (err) {
    console.error("[precoDaSkinDoSorteioAction]", err);
    return { ok: false, erro: "Erro ao consultar o preço" };
  }
}
