"use server";

// O estado da entrega e o custo dela.
//
// A fila de /admin/entregas diz quem ganhou, o que ganhou e para onde enviar.
// Estas ações são o que a torna operável: em que pé cada entrega está, e quanto
// custou comprar a skin.
//
// Trocar de estado é sempre reversível, e isso não é enfeite: são várias linhas
// parecidas numa lista, e o erro mais provável é mexer na linha errada.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import {
  assertRaffleInActiveTenant,
  getActiveTenantIdForAdmin,
} from "@/lib/tenant";
import { registrarLog } from "@/server/services/activity-log";
import { buscarCotacao, cambioDoDia } from "@/server/services/cotacao";
import type { ActionResult } from "@/server/actions/auth";

const esquema = z.object({
  raffleId: z.string().min(1),
  status: z.enum([
    "PRIORIDADE",
    "AGUARDANDO",
    "ENVIADO",
    "ERRO",
    "REENVIO",
    "PIX",
  ]),
  // Número da oferta na Steam, motivo do erro, o que for. Teto porque é campo
  // livre exposto a quem tem o painel, e texto sem limite vira problema de
  // armazenamento e de tela.
  observacao: z.string().max(500).optional().nullable(),
});

/**
 * Troca o estado da entrega.
 *
 * Era "marcar entregue" e "desmarcar", um booleano. A fila tem mais do que dois
 * estados, então virou uma troca só, com o estado vindo do seletor.
 *
 * `deliveredAt` continua sendo a data em que a skin SAIU, e não a data da
 * última mexida: entra ao chegar em ENVIADO e é limpa ao sair dele. Se ficasse
 * gravada, uma entrega que voltou para REENVIO continuaria dizendo que foi
 * entregue em tal dia, o que é falso.
 */
export async function marcarEntregaAction(
  raw: unknown,
): Promise<ActionResult<{ status: string }>> {
  const parsed = esquema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Dados inválidos" };

  try {
    const session = await getAdminOrThrow();
    // Sem esta checagem, o id de uma campanha de OUTRO painel seria alterável
    // daqui: o id vem do cliente. Ela também devolve o tenant, que vai no log.
    const tenantId = await assertRaffleInActiveTenant(
      parsed.data.raffleId,
      session.user,
    );

    const rifa = await prisma.raffle.findUnique({
      where: { id: parsed.data.raffleId },
      select: { title: true, winnerTicketNumber: true },
    });
    if (!rifa) return { ok: false, error: "Campanha não encontrada." };
    // Entrega de campanha sem ganhador não existe, e deixar mexer criaria um
    // registro que não quer dizer nada.
    if (rifa.winnerTicketNumber == null) {
      return { ok: false, error: "Esta campanha ainda não tem ganhador." };
    }

    const enviado = parsed.data.status === "ENVIADO";
    const observacao = parsed.data.observacao?.trim() || null;

    await prisma.raffle.update({
      where: { id: parsed.data.raffleId },
      data: {
        deliveryStatus: parsed.data.status,
        deliveredAt: enviado ? new Date() : null,
        deliveredById: enviado ? session.user.id : null,
        deliveryNote: observacao,
      },
    });

    await registrarLog({
      acao: "entrega.marcada",
      tenantId,
      alvo: { tipo: "Raffle", id: parsed.data.raffleId, rotulo: rifa.title },
      detalhes: {
        titulo: rifa.winnerTicketNumber,
        status: parsed.data.status,
        observacao,
      },
    });

    revalidatePath("/admin/entregas");
    return { ok: true, data: { status: parsed.data.status } };
  } catch {
    return { ok: false, error: "Não foi possível salvar." };
  }
}

/**
 * O custo da entrega: quanto saiu do caixa para comprar a skin.
 *
 * Ação separada de marcar entregue, e de propósito. As duas coisas acontecem em
 * momentos diferentes: às vezes a skin é comprada antes de a oferta sair, às
 * vezes o valor só é conferido depois. Amarrar o custo ao ato de marcar
 * obrigaria a saber o preço na hora exata do envio, e obrigaria a desmarcar
 * para corrigir um valor digitado errado.
 *
 * Campo vazio limpa, que é o mesmo gesto de apagar o número e sair.
 */
export async function salvarCustoDaEntregaAction(
  raffleId: string,
  valor: number | null,
): Promise<ActionResult<{ deliveryCost: number | null }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await assertRaffleInActiveTenant(raffleId, session.user);

    if (
      valor != null &&
      (!Number.isFinite(valor) || valor < 0 || valor > 99_999_999)
    ) {
      return { ok: false, error: "Valor inválido." };
    }

    const rifa = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        title: true,
        deliveryStatus: true,
        deliveredAt: true,
        winnerDrawnAt: true,
      },
    });
    if (!rifa) return { ok: false, error: "Campanha não encontrada." };

    // O CUSTO E O ENVIO ANDAM JUNTOS, NOS DOIS SENTIDOS.
    //
    // Anotar quanto custou é o que se faz DEPOIS de comprar a skin do
    // fornecedor e mandar a oferta: as duas coisas acontecem no mesmo minuto, e
    // exigir dois gestos para registrar um só ato é onde a fila fica
    // desatualizada.
    //
    // E APAGAR O CUSTO DESFAZ O ENVIO. Eu tinha feito o contrário, tratando o
    // apagar como conserto de número digitado errado, e estava errado: quem
    // tira o valor está desfazendo o registro, e a entrega precisa voltar para
    // a fila. Sem isso ela ficava presa em Enviado sem custo nenhum, que é um
    // estado que não quer dizer nada.
    //
    // PIX fica de fora dos dois sentidos: ela é escolha explícita, o valor ali
    // é o do dinheiro pago, e mexer nele não pode transformá-la em skin
    // enviada nem devolvê-la para a fila.
    const ehPix = rifa.deliveryStatus === "PIX";
    const marcarEnviado =
      valor != null && !ehPix && rifa.deliveryStatus !== "ENVIADO";
    const desfazerEnvio = valor == null && rifa.deliveryStatus === "ENVIADO";

    // O CÂMBIO FICA GRAVADO NA LINHA, E NÃO SÓ NO PAINEL.
    //
    // A taxa buscada é a do DIA DESTA ENTREGA, e não a de hoje: é ela que
    // converte este custo no relatório para sempre. Sem isso, atualizar a taxa
    // do painel reconverteria o gasto de julho pelo câmbio de hoje.
    //
    // Data da entrega, com o sorteio como segunda opção: o custo pode ser
    // anotado antes de a oferta sair, e aí ainda não há data de envio.
    //
    // Falha na busca não impede salvar o custo. O custo é o dado que a pessoa
    // tem na mão; o câmbio é enfeite conferível que dá para preencher depois,
    // e travar o salvamento por causa do Banco Central seria trocar um
    // problema pequeno por um grande.
    const quando = rifa.deliveredAt ?? rifa.winnerDrawnAt ?? new Date();
    const tentativa = valor == null ? null : await cambioDoDia("CNY", quando);
    const cambio = tentativa?.cambio ?? null;

    await prisma.raffle.update({
      where: { id: raffleId },
      data: {
        // Duas casas na entrada também, e não só no banco: sem isto, um valor
        // colado com três decimais viraria arredondamento silencioso do
        // Postgres.
        deliveryCost: valor == null ? null : Number(valor.toFixed(2)),
        // Apagar o custo apaga o câmbio junto: taxa sem custo é sujeira que
        // ninguém vai conferir, e que confundiria quem lesse a linha depois.
        deliveryFxRate: valor == null ? null : (cambio?.taxa ?? null),
        deliveryFxDate: valor == null ? null : (cambio?.quando ?? null),
        deliveryFxSource: valor == null ? null : (cambio?.fonte ?? null),
        ...(marcarEnviado
          ? {
              deliveryStatus: "ENVIADO" as const,
              deliveredAt: new Date(),
              deliveredById: session.user.id,
            }
          : {}),
        ...(desfazerEnvio
          ? {
              deliveryStatus: "AGUARDANDO" as const,
              deliveredAt: null,
              deliveredById: null,
            }
          : {}),
      },
    });

    await registrarLog({
      acao: "entrega.custo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId, rotulo: rifa.title },
      detalhes: {
        custo: valor,
        marcouEnviado: marcarEnviado,
        desfezEnvio: desfazerEnvio,
        cambio: cambio?.taxa ?? null,
        cambioDe: cambio?.quando?.toISOString() ?? null,
        cambioFonte: cambio?.fonte ?? null,
        // O motivo entra no registro quando não veio taxa: é o que permite
        // descobrir depois por que uma linha ficou sem câmbio.
        cambioNotas: cambio ? undefined : (tentativa?.notas ?? undefined),
      },
    });

    revalidatePath("/admin/entregas");
    return { ok: true, data: { deliveryCost: valor } };
  } catch {
    return { ok: false, error: "Não foi possível salvar o custo." };
  }
}

/**
 * As taxas de câmbio usadas para ler o custo em real e em dólar.
 *
 * Digitadas, e não buscadas de uma API. Câmbio inventado por padrão vira
 * relatório financeiro errado com cara de certo, e quem opera é quem sabe a
 * que taxa comprou.
 *
 * Nulo apaga: sem taxa, a tela mostra só yuan e diz por quê, em vez de exibir
 * uma conversão baseada em número velho.
 */
export async function salvarTaxasAction(
  cnyToBrl: number | null,
  usdToBrl: number | null,
): Promise<ActionResult<null>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    for (const v of [cnyToBrl, usdToBrl]) {
      // Zero e negativo não são taxa: um vira divisão por zero, o outro vira
      // valor negativo na tela.
      if (v != null && (!Number.isFinite(v) || v <= 0 || v > 1000)) {
        return { ok: false, error: "Taxa inválida." };
      }
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { cnyToBrl, usdToBrl },
    });

    await registrarLog({
      acao: "config.site_alterada",
      tenantId,
      alvo: { tipo: "Tenant", id: tenantId },
      detalhes: { cnyToBrl, usdToBrl },
    });

    revalidatePath("/admin/entregas");
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: "Não foi possível salvar as taxas." };
  }
}

/**
 * A cotação de mercado do yuan e do dólar, para sugerir no diálogo de taxas.
 *
 * Só sugere: quem salva é a ação de cima, com o número que a pessoa confirmou.
 * O relatório financeiro usa a taxa GRAVADA, e não esta, senão um período já
 * fechado mudaria de valor a cada abertura da página, ao sabor do câmbio.
 *
 * Exige admin porque é o painel que a usa, e porque uma rota aberta viraria um
 * proxy de graça para a cota de requisições da conta.
 */
export async function buscarCotacaoAction(): Promise<
  ActionResult<{
    cnyToBrl: number | null;
    usdToBrl: number | null;
    atualizadaEm: string | null;
    fonteCny: string | null;
    fonteUsd: string | null;
    notasCny: string[];
    notasUsd: string[];
    salvas: boolean;
  }>
> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const c = await buscarCotacao();
    if (!c) {
      return { ok: false, error: "Não foi possível buscar a cotação agora." };
    }

    // SALVA SOZINHA.
    //
    // Digitar a taxa era trabalho que ninguém lembrava de refazer, e taxa
    // esquecida converte custo de skin por um câmbio de semanas atrás.
    //
    // SÓ o que veio: uma moeda que a fonte não trouxe não pode apagar a taxa
    // boa que já estava salva. Este é o campo de retaguarda, e zerá-lo em dia
    // de fonte fora do ar deixaria o painel pior do que antes de buscar.
    const aSalvar: { cnyToBrl?: number; usdToBrl?: number } = {};
    if (c.cnyToBrl != null) aSalvar.cnyToBrl = c.cnyToBrl;
    if (c.usdToBrl != null) aSalvar.usdToBrl = c.usdToBrl;
    const salvas = Object.keys(aSalvar).length > 0;
    if (salvas) {
      await prisma.tenant.update({ where: { id: tenantId }, data: aSalvar });
      revalidatePath("/admin/entregas");
    }

    return {
      ok: true,
      data: {
        cnyToBrl: c.cnyToBrl,
        usdToBrl: c.usdToBrl,
        // Texto, e não Date: a data atravessa a fronteira servidor/cliente, e
        // ISO é o formato que sobrevive à travessia sem surpresa de fuso.
        atualizadaEm: c.atualizadaEm?.toISOString() ?? null,
        fonteCny: c.fonteCny,
        fonteUsd: c.fonteUsd,
        notasCny: c.notasCny,
        notasUsd: c.notasUsd,
        salvas,
      },
    };
  } catch {
    return { ok: false, error: "Não foi possível buscar a cotação agora." };
  }
}

/**
 * Tira uma entrega da fila, ou traz de volta.
 *
 * Arquivar não apaga nada: o sorteio, o ganhador, o número e o comprovante
 * continuam de pé, e a linha volta pelo filtro "Removidas". Existe porque
 * fila com linha que ninguém vai tocar (sorteio de teste, entrega resolvida
 * por fora) esconde o que de fato falta fazer.
 */
export async function arquivarEntregaAction(
  raw: unknown,
): Promise<ActionResult<{ arquivada: boolean }>> {
  const parsed = z
    .object({ raffleId: z.string().cuid(), arquivar: z.boolean() })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Dados inválidos" };

  try {
    const session = await getAdminOrThrow();
    // O id vem do cliente: sem esta checagem, o id de uma campanha de outro
    // painel sairia da fila daqui.
    const tenantId = await assertRaffleInActiveTenant(
      parsed.data.raffleId,
      session.user,
    );

    const rifa = await prisma.raffle.findUnique({
      where: { id: parsed.data.raffleId },
      select: { title: true, winnerTicketNumber: true },
    });
    if (!rifa) return { ok: false, error: "Campanha não encontrada." };
    if (rifa.winnerTicketNumber == null) {
      return { ok: false, error: "Esta campanha ainda não tem ganhador." };
    }

    await prisma.raffle.update({
      where: { id: parsed.data.raffleId },
      data: {
        entregaArquivadaEm: parsed.data.arquivar ? new Date() : null,
      },
    });

    await registrarLog({
      acao: "entrega.marcada",
      tenantId,
      alvo: { tipo: "Raffle", id: parsed.data.raffleId, rotulo: rifa.title },
      detalhes: {
        o_que: parsed.data.arquivar
          ? "entrega removida da fila"
          : "entrega devolvida à fila",
      },
    });

    revalidatePath("/admin/entregas");
    return { ok: true, data: { arquivada: parsed.data.arquivar } };
  } catch {
    return { ok: false, error: "Não foi possível remover da fila." };
  }
}
