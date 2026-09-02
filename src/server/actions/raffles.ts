"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type SkinWear } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import {
  assertRaffleInActiveTenant,
  getActiveTenantIdForAdmin,
} from "@/lib/tenant";
import {
  apagarArquivoSeOrfao,
  copiarArquivoDoStorage,
  isStorageConfigured,
} from "@/lib/storage";
import {
  camposObrigatoriosCoerentes,
  raffleGeneralSchema,
} from "@/lib/validations/raffle";
import { garantirSlugLivre } from "@/server/services/raffles";
import { toSlug } from "@/lib/slug";
import { registrarLog } from "@/server/services/activity-log";
import { garantirSemente } from "@/server/services/sorteio-ao-vivo";
import { diferencas } from "@/lib/activity-log-detalhes";
import { desviarDeReservado, slugReservado } from "@/lib/rotas-reservadas";
import type { ActionResult } from "@/server/actions/auth";

const updateInputSchema = z.object({
  id: z.string().cuid(),
  data: raffleGeneralSchema,
});

const statusUpdateSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(["DRAFT", "QUEUED", "ACTIVE", "FINISHED", "CANCELLED"]),
});

const highlightUpdateSchema = z.object({
  id: z.string().cuid(),
  showOnHome: z.boolean(),
});

export async function createRaffleAction(
  raw: unknown,
  // Skin do catálogo escolhida na criação. Vira o primeiro prêmio e a capa
  // no mesmo passo: sem isso, a pessoa criaria o sorteio e depois teria de
  // redigitar a ficha na aba Prêmios e reenviar a mesma foto na aba Imagens.
  skinTemplateId?: string,
  // Desgaste escolhido na criação. O catálogo guarda uma linha por skin sem
  // desgaste, porque a mesma skin é sorteada em Field-Tested numa campanha e
  // em Factory New na outra; sem este parâmetro o prêmio nascia sem desgaste
  // e a ficha na página do sorteio ficava incompleta.
  skinWear?: SkinWear
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

    // A URL sai do que o admin escreveu, ou do título quando ele não mexeu.
    // Nos dois casos passa pelo mesmo resolvedor: sortear a mesma skin de
    // novo é rotina aqui, e recusar a criação por causa da URL repetida
    // obrigaria a inventar nome diferente para a mesma skin. Numera sozinho
    // e segue.
    const { slug: providedSlug, ...rest } = parsed.data;
    // A URL do sorteio mora na raiz do host, então o slug divide o primeiro
    // segmento do caminho com as rotas do site. O Next resolve rota estática
    // antes de dinâmica: um slug "login" nasceria inalcançável em silêncio.
    //
    // Os dois casos recebem tratamento diferente porque a intenção é outra.
    // Slug digitado é escolha do admin, e escolha errada se diz na cara.
    // Slug derivado do título não foi escolhido por ninguém, e recusar a
    // criação obrigaria a renomear a campanha por causa de um detalhe de
    // roteamento; esse ganha sufixo e segue.
    if (providedSlug && slugReservado(toSlug(providedSlug))) {
      return {
        ok: false,
        error: "Essa URL é reservada pelo site. Escolha outra.",
        fieldErrors: { slug: ["Reservada pelo site"] },
      };
    }
    const slug = await garantirSlugLivre(
      desviarDeReservado(toSlug(providedSlug || parsed.data.title)),
      tenantId
    );

    // Busca antes de abrir a transação: id de outro tenant simplesmente não
    // encontra, e aí o sorteio nasce sem prêmio em vez de nascer com o de
    // outra pessoa.
    const skin = skinTemplateId
      ? await prisma.skinTemplate.findFirst({
          where: { id: skinTemplateId, tenantId },
          // As artes vêm junto: é uma delas que vira a capa.
          include: { artes: true },
        })
      : null;

    // A arte de campanha da skin, se houver. A do desgaste escolhido manda; a
    // genérica (wear nulo) é o resto. A foto da skin nunca entra aqui: ela é
    // o render do jogo, e a capa é arte feita à mão.
    const arteDaCapa = skin
      ? (skin.artes.find((a) => a.wear === (skinWear ?? skin.skinWear)) ??
        skin.artes.find((a) => a.wear === null))
      : null;

    // A cópia sai FORA da transação: storage não participa dela, e uma
    // chamada de rede lá dentro seguraria a transação aberta pelo tempo da
    // subida. Falhando a cópia, cai na URL da arte, que é o comportamento
    // antigo: capa compartilhada é pior que capa nenhuma só na hora de
    // apagar, e apagarArquivoSeOrfao cobre esse caso.
    const urlDaCapa = arteDaCapa
      ? await copiarArquivoDoStorage(arteDaCapa.url, "raffles/capas")
      : null;

    try {
      const raffle = await prisma.$transaction(async (tx) => {
        const criado = await tx.raffle.create({
          data: {
            ...rest,
            requiredFields: camposObrigatoriosCoerentes(rest.requiredFields),
            slug,
            createdById: session.user.id,
            tenantId,
          },
          select: { id: true, slug: true },
        });

        if (skin) {
          await tx.prize.create({
            data: {
              raffleId: criado.id,
              position: 1,
              description: skin.name,
              imageUrl: skin.imageUrl,
              skinName: skin.name,
              skinRarity: skin.skinRarity,
              // O escolhido manda; o do catálogo é o resto, para a skin
              // cadastrada à mão que já veio com desgaste.
              skinWear: skinWear ?? skin.skinWear,
              skinFloat: skin.skinFloat,
              skinStatTrak: skin.skinStatTrak,
              skinSouvenir: skin.skinSouvenir,
              skinValueBrl: skin.skinValueBrl,
              skinCollection: skin.skinCollection,
              skinInspectUrl: skin.skinInspectUrl,
            },
          });

          // A capa vem da ARTE da skin, nunca da foto dela.
          //
          // A foto é o render do jogo e continua sendo a imagem do prêmio,
          // que é o que aparece em "Ver as skins premiadas". Ela chegou a
          // virar capa, e estava errado: obrigava a trocar depois, em toda
          // campanha, uma imagem que ninguém pediu.
          //
          // Sem arte cadastrada, o sorteio nasce sem capa e a página desenha
          // o painel com a cor da raridade e o nome da skin, então nada fica
          // quebrado enquanto a arte não existe.
          if (arteDaCapa) {
            await tx.raffleImage.create({
              data: {
                raffleId: criado.id,
                // A cópia, e não a URL da arte. Apontar os dois para o mesmo
                // arquivo fazia um apagar o outro: remover ou trocar a capa
                // apaga o arquivo, e a arte da skin ficava no banco apontando
                // para um arquivo que não existe mais.
                url: urlDaCapa ?? arteDaCapa.url,
                isCover: true,
                order: 0,
              },
            });
          }
        }

        return criado;
      });

      // A semente do sorteio, comprometida AGORA.
      //
      // A ordem é o que dá valor ao compromisso: o hash da semente fica
      // público enquanto as cotas são vendidas, antes de existir uma lista de
      // participantes. Se ele nascesse junto do sorteio, quem opera o site já
      // saberia quem está no bolo e poderia gerar mil sementes até achar a que
      // faz ganhar quem ele quer, publicando só o hash escolhido. Travando
      // antes da primeira venda, essa escolha deixa de existir.
      //
      // Fora da transação e com catch próprio: a campanha não pode deixar de
      // nascer porque o compromisso falhou. O motor do sorteio chama a mesma
      // função antes de sortear, então uma falha aqui é recuperada depois, com
      // um compromisso mais fraco (posterior às vendas) e o carimbo de data
      // dizendo isso.
      await garantirSemente(raffle.id).catch((err) =>
        console.error("[createRaffleAction] compromisso da semente:", err),
      );

      await registrarLog({
        acao: "sorteio.criado",
        tenantId,
        alvo: { tipo: "Raffle", id: raffle.id, rotulo: parsed.data.title },
        detalhes: { slug: raffle.slug },
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
    // Mesmo motivo da criação: na edição só existe slug digitado, então
    // não há o que desviar, só o que recusar.
    if (slug && slugReservado(slug)) {
      return {
        ok: false,
        error: "Essa URL é reservada pelo site. Escolha outra.",
        fieldErrors: { slug: ["Reservada pelo site"] },
      };
    }
    const data: Prisma.RaffleUpdateInput = {
      ...rest,
      requiredFields: camposObrigatoriosCoerentes(rest.requiredFields),
      ...(slug ? { slug } : {}),
    };

    // Invalida a página da rifa antiga antes de mudar (slug muda → URL muda).
    // Também valida que a rifa pertence ao tenant atual.
    //
    // O select traz todos os campos que o formulário edita, e não só o slug,
    // porque é este retrato que vira o lado "antes" do registro. Sem ele, o
    // histórico diria que alguém editou o sorteio e nada sobre o preço que
    // havia antes, que é a pergunta que motivou o registro inteiro.
    const oldRaffle = await prisma.raffle.findUnique({
      where: { id: parsed.data.id },
      select: {
        slug: true,
        tenantId: true,
        title: true,
        shortDescription: true,
        description: true,
        descriptionMode: true,
        category: true,
        privacy: true,
        showOnHome: true,
        drawDate: true,
        salesStart: true,
        autoCloseOnDraw: true,
        showDrawDate: true,
        allowReceiptDownload: true,
        showParticipantName: true,
        statusText: true,
        modality: true,
        reservationModel: true,
        requiredFields: true,
        totalNumbers: true,
        pricePerNumber: true,
        isFree: true,
        freeLabel: true,
        hasFee: true,
        feeAmount: true,
        reservationTimeoutMinutes: true,
        minPurchase: true,
        maxPurchase: true,
        initialQuantity: true,
        maxPerBuyer: true,
        minLevel: true,
        showProgressBar: true,
        showDailyRanking: true,
        showOverallRanking: true,
        showShareButtons: true,
        selectionCards: true,
        selectionCardsBestseller: true,
      },
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

      // Decimal do Prisma vira número dos dois lados antes de comparar. Ele
      // chega como objeto, e a comparação por referência acusaria mudança de
      // preço em todo salvamento, inclusive naquele em que ninguém tocou no
      // preço.
      const d = parsed.data.data;
      const mudou = diferencas(
        {
          titulo: oldRaffle.title,
          urlAmigavel: oldRaffle.slug,
          modoDaDescricao: oldRaffle.descriptionMode,
          categoria: oldRaffle.category,
          privacidade: oldRaffle.privacy,
          destaqueNaHome: oldRaffle.showOnHome,
          dataDoSorteio: oldRaffle.drawDate,
          inicioDasVendas: oldRaffle.salesStart,
          fecharAoSortear: oldRaffle.autoCloseOnDraw,
          mostrarDataDoSorteio: oldRaffle.showDrawDate,
          permitirComprovante: oldRaffle.allowReceiptDownload,
          mostrarNomeDoParticipante: oldRaffle.showParticipantName,
          textoDeStatus: oldRaffle.statusText,
          modalidade: oldRaffle.modality,
          modeloDeReserva: oldRaffle.reservationModel,
          camposObrigatorios: oldRaffle.requiredFields,
          totalDeNumeros: oldRaffle.totalNumbers,
          precoPorNumero: Number(oldRaffle.pricePerNumber),
          gratuito: oldRaffle.isFree,
          rotuloDeGratuito: oldRaffle.freeLabel,
          temTaxa: oldRaffle.hasFee,
          valorDaTaxa:
            oldRaffle.feeAmount === null ? null : Number(oldRaffle.feeAmount),
          minutosParaExpirar: oldRaffle.reservationTimeoutMinutes,
          compraMinima: oldRaffle.minPurchase,
          compraMaxima: oldRaffle.maxPurchase,
          quantidadeInicial: oldRaffle.initialQuantity,
          maximoPorComprador: oldRaffle.maxPerBuyer,
          nivelMinimo: oldRaffle.minLevel,
          mostrarBarraDeProgresso: oldRaffle.showProgressBar,
          mostrarRankingDiario: oldRaffle.showDailyRanking,
          mostrarRankingGeral: oldRaffle.showOverallRanking,
          mostrarBotoesDeCompartilhar: oldRaffle.showShareButtons,
          cardsDeSelecao: oldRaffle.selectionCards,
          cardDestaque: oldRaffle.selectionCardsBestseller,
        },
        {
          titulo: d.title,
          // Slug vazio mantém o atual (ver montagem de `data` acima), então o
          // lado "depois" é o slug que a rifa realmente ficou tendo.
          urlAmigavel: raffle.slug,
          modoDaDescricao: d.descriptionMode,
          categoria: d.category ?? null,
          privacidade: d.privacy,
          destaqueNaHome: d.showOnHome,
          dataDoSorteio: d.drawDate ?? null,
          inicioDasVendas: d.salesStart ?? null,
          fecharAoSortear: d.autoCloseOnDraw,
          mostrarDataDoSorteio: d.showDrawDate,
          permitirComprovante: d.allowReceiptDownload,
          mostrarNomeDoParticipante: d.showParticipantName,
          textoDeStatus: d.statusText ?? null,
          modalidade: d.modality,
          modeloDeReserva: d.reservationModel,
          camposObrigatorios: d.requiredFields,
          totalDeNumeros: d.totalNumbers,
          precoPorNumero: d.pricePerNumber,
          gratuito: d.isFree,
          rotuloDeGratuito: d.freeLabel ?? null,
          temTaxa: d.hasFee,
          valorDaTaxa: d.feeAmount ?? null,
          minutosParaExpirar: d.reservationTimeoutMinutes,
          compraMinima: d.minPurchase,
          compraMaxima: d.maxPurchase ?? null,
          quantidadeInicial: d.initialQuantity ?? null,
          maximoPorComprador: d.maxPerBuyer ?? null,
          nivelMinimo: d.minLevel ?? null,
          mostrarBarraDeProgresso: d.showProgressBar,
          mostrarRankingDiario: d.showDailyRanking,
          mostrarRankingGeral: d.showOverallRanking,
          mostrarBotoesDeCompartilhar: d.showShareButtons,
          cardsDeSelecao: d.selectionCards,
          cardDestaque: d.selectionCardsBestseller,
        }
      );

      // A descrição fica de fora do diff de propósito: são até 50 mil
      // caracteres de HTML por lado, e ninguém audita texto longo lendo dois
      // blocos lado a lado num histórico. O marcador diz que mudou, que é o que
      // se procura; o conteúdo atual está no próprio sorteio.
      if (oldRaffle.description !== (d.description ?? null)) {
        mudou.depois.descricaoAlterada = true;
      }
      if (oldRaffle.shortDescription !== (d.shortDescription ?? null)) {
        mudou.depois.descricaoCurtaAlterada = true;
      }

      await registrarLog({
        acao: "sorteio.editado",
        tenantId,
        alvo: { tipo: "Raffle", id: parsed.data.id, rotulo: d.title },
        detalhes: mudou,
      });

      revalidatePath("/admin/sorteios");
      revalidatePath(`/admin/sorteios/${raffle.id}/editar`);
      revalidatePath(`/${raffle.slug}`);
      if (oldRaffle && oldRaffle.slug !== raffle.slug) {
        revalidatePath(`/${oldRaffle.slug}`);
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

    // Escrita de painel que muda o que o cliente vê na home, então entra no
    // histórico como qualquer outra alteração de conteúdo do sorteio.
    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: parsed.data.id },
      detalhes: {
        o_que: "destaque",
        depois: { destaqueNaHome: updated.showOnHome },
      },
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

    await registrarLog({
      acao: "sorteio.status_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: parsed.data.id },
      detalhes: { depois: { status: parsed.data.status } },
    });

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
        // Mesma guarda da remoção de imagem avulsa: apagar um sorteio não
        // pode levar embora a arte da skin, que é reaproveitada por toda
        // campanha futura daquela skin.
        await apagarArquivoSeOrfao(img.url, async () => {
          const [outraImagem, arte] = await Promise.all([
            prisma.raffleImage.count({
              where: { url: img.url, raffleId: { not: raffle.id } },
            }),
            prisma.skinArt.count({ where: { url: img.url } }),
          ]);
          return outraImagem + arte > 0;
        });
      }
    }

    await prisma.raffle.delete({ where: { id: raffle.id } });

    // O rótulo é congelado a partir do título que estava no banco, lido antes
    // do delete: depois dele a linha não existe mais para ser consultada. Não
    // sai do que a pessoa digitou para confirmar, porque a conferência ignora
    // caixa e espaços, e "SORTEIO da ak " viraria o nome no histórico.
    await registrarLog({
      acao: "sorteio.excluido",
      tenantId,
      alvo: { tipo: "Raffle", id: raffle.id, rotulo: raffle.title },
    });

    revalidatePath("/admin/sorteios");
    revalidatePath(`/${raffle.slug}`);
    revalidatePath("/sorteios");
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[deleteRaffleAction]", err);
    return { ok: false, error: "Erro ao excluir sorteio" };
  }
}

// =============================================================
// VITRINE: campanha principal e ordem manual
// =============================================================

const campanhaDaVitrineSchema = z.object({ raffleId: z.string().cuid() });

/**
 * Marca a campanha principal do site, e desmarca a anterior.
 *
 * Numa transação, e nesta ordem: existe índice parcial único garantindo uma
 * principal por tenant, então marcar antes de desmarcar bateria nele. A
 * exclusividade morar no banco é proposital: duas principais fariam a vitrine
 * escolher uma pela ordem de criação, que é o mesmo que não ter escolhido.
 */
export async function definirCampanhaPrincipalAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = campanhaDaVitrineSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    await assertRaffleInActiveTenant(parsed.data.raffleId, session.user);

    const raffle = await prisma.raffle.findUniqueOrThrow({
      where: { id: parsed.data.raffleId },
      select: { tenantId: true, principal: true },
    });

    await prisma.$transaction([
      prisma.raffle.updateMany({
        where: { tenantId: raffle.tenantId, principal: true },
        data: { principal: false },
      }),
      // Clicar na que já é principal desmarca: sem isso não haveria como
      // deixar a vitrine sem destaque escolhido.
      ...(raffle.principal
        ? []
        : [
            prisma.raffle.update({
              where: { id: parsed.data.raffleId },
              data: { principal: true },
            }),
          ]),
    ]);

    revalidatePath("/admin/sorteios");
    revalidatePath("/sorteios");
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[definirCampanhaPrincipalAction]", err);
    return { ok: false, error: "Erro ao definir a campanha principal" };
  }
}

const moverCampanhaSchema = z.object({
  raffleId: z.string().cuid(),
  direcao: z.enum(["cima", "baixo"]),
});

/**
 * Sobe ou desce a campanha uma posição na vitrine.
 *
 * Troca a `ordem` com a vizinha, em vez de reescrever a lista inteira: o
 * painel é paginado, e renumerar tudo a partir do que está na tela mexeria na
 * posição de campanha que o admin nem está vendo.
 *
 * A vizinha é procurada pela mesma ordem da vitrine, senão subir no painel
 * moveria a campanha para um lugar diferente do que o site mostra.
 */
export async function moverCampanhaAction(
  raw: unknown
): Promise<ActionResult> {
  try {
    const session = await getAdminOrThrow();
    const parsed = moverCampanhaSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    await assertRaffleInActiveTenant(parsed.data.raffleId, session.user);

    const atual = await prisma.raffle.findUniqueOrThrow({
      where: { id: parsed.data.raffleId },
      select: { id: true, tenantId: true, ordem: true, createdAt: true },
    });

    const paraCima = parsed.data.direcao === "cima";
    const vizinha = await prisma.raffle.findFirst({
      where: {
        tenantId: atual.tenantId,
        id: { not: atual.id },
        ...(paraCima
          ? {
              OR: [
                { ordem: { lt: atual.ordem } },
                { ordem: atual.ordem, createdAt: { gt: atual.createdAt } },
              ],
            }
          : {
              OR: [
                { ordem: { gt: atual.ordem } },
                { ordem: atual.ordem, createdAt: { lt: atual.createdAt } },
              ],
            }),
      },
      orderBy: paraCima
        ? [{ ordem: "desc" }, { createdAt: "asc" }]
        : [{ ordem: "asc" }, { createdAt: "desc" }],
      select: { id: true, ordem: true },
    });

    // Já é a primeira ou a última: nada a fazer, e não é erro.
    if (!vizinha) return { ok: true, data: undefined };

    // Empate na ordem não move nada ao trocar os valores. Nesse caso a atual
    // recebe a posição da vizinha e a vizinha anda um passo, o que desempata
    // sem tocar no resto da lista.
    const [novaAtual, novaVizinha] =
      atual.ordem === vizinha.ordem
        ? paraCima
          ? [vizinha.ordem, vizinha.ordem + 1]
          : [vizinha.ordem, vizinha.ordem - 1]
        : [vizinha.ordem, atual.ordem];

    await prisma.$transaction([
      prisma.raffle.update({
        where: { id: atual.id },
        data: { ordem: novaAtual },
      }),
      prisma.raffle.update({
        where: { id: vizinha.id },
        data: { ordem: novaVizinha },
      }),
    ]);

    revalidatePath("/admin/sorteios");
    revalidatePath("/sorteios");
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[moverCampanhaAction]", err);
    return { ok: false, error: "Erro ao mover a campanha" };
  }
}
