// O preço sugerido de uma skin, com as três fontes em ordem.
//
// A regra estava dentro da action e ela era otimista demais: consultava a
// Steam e, quando a Steam não respondia o que se esperava, não sobrava nada.
// Foi o que aconteceu na primeira campanha criada com skin do catálogo, uma
// Gut Knife: a busca rodou, voltou vazia, e o preço ficou no padrão de R$ 1,00
// sem ninguém entender por quê.
//
// A ORDEM DAS FONTES
//
// 1. O CACHE. Preço guardado nas últimas doze horas serve: skin não é ação de
//    bolsa, o preço se move em dias.
//
// 2. A STEAM. É a fonte viva, e é ela que mantém o resto atualizado.
//
// 3. O CATÁLOGO. `SkinTemplate.skinValueBrl`, preenchido à mão no painel ou
//    por uma consulta anterior que deu certo. É a rede: a Steam é uma API não
//    documentada, limitada por IP, e um painel que depende dela para funcionar
//    fica refém de um serviço que não promete nada a ninguém.
//
// E QUANDO A STEAM RESPONDE, O CATÁLOGO APRENDE
//
// Toda consulta bem-sucedida grava o valor no catálogo. Assim cada skin
// precisa que a Steam funcione UMA vez; da segunda em diante, mesmo com a
// Steam fora, o painel sugere preço.
//
// O MOTIVO DA FALHA VIRA LOG
//
// Antes, "a Steam não tem anúncio" e "a Steam limitou" saíam para a tela e
// morriam ali. Agora ficam no console do servidor com o nome consultado, que é
// a única forma de descobrir, depois, se o problema é o nome que montamos ou o
// IP de onde a chamada sai.

import type { SkinWear } from "@prisma/client";

import { prisma } from "@/lib/db";
import { WEAR_STEAM } from "@/lib/cs2";
import { buscarPrecoNaSteam, SteamLimitouError } from "@/lib/steam-market";

/**
 * Por quanto tempo um preço guardado ainda serve.
 *
 * Meio dia deixa o número atual sem transformar cada abertura da tela numa
 * consulta.
 */
const VALIDADE_HORAS = 12;

export type OrigemDoPreco = "steam" | "despejo" | "cache" | "catalogo";

export type PrecoSugerido =
  | {
      ok: true;
      brl: number;
      origem: OrigemDoPreco;
      buscadoEm: string | null;
      volume: number | null;
    }
  | {
      ok: false;
      /** Frase pronta para a tela, já explicando o que fazer. */
      erro: string;
      /** True quando a Steam respondeu, mas não tem esse item à venda. */
      semPreco?: boolean;
    };

/**
 * O preço de uma skin do catálogo, para o painel sugerir a cota.
 *
 * `forcar` pula o cache: é o botão "buscar de novo" da tela.
 */
export async function precoSugeridoDaSkin(input: {
  skinTemplateId: string;
  tenantId: string;
  wear: SkinWear | null;
  forcar?: boolean;
}): Promise<PrecoSugerido> {
  const { skinTemplateId, tenantId, wear } = input;

  // O tenant entra na busca de propósito: sem ele, um admin poderia sondar o
  // catálogo de outro painel passando um id qualquer.
  const skin = await prisma.skinTemplate.findFirst({
    where: { id: skinTemplateId, tenantId },
    select: {
      id: true,
      name: true,
      skinStatTrak: true,
      skinSouvenir: true,
      skinValueBrl: true,
    },
  });
  if (!skin) return { ok: false, erro: "Skin não encontrada no catálogo." };

  // O preço guardado deste desgaste, de qualquer idade. Ele serve duas vezes:
  // fresco, evita a consulta; velho, é a reserva quando a Steam não responde.
  const guardado = await prisma.skinPreco.findFirst({
    where: { skinTemplateId, wear },
    select: { brl: true, buscadoEm: true, volume: true, fonte: true },
  });

  if (!input.forcar && guardado) {
    const limite = Date.now() - VALIDADE_HORAS * 3_600_000;
    if (guardado.buscadoEm.getTime() > limite) return doGuardado(guardado);
  }

  const doCatalogo = skin.skinValueBrl == null ? null : Number(skin.skinValueBrl);
  /** A reserva, na ordem: preço deste desgaste, depois valor da skin. */
  const reserva = (): PrecoSugerido | null =>
    (guardado ? doGuardado(guardado) : null) ?? comCatalogo(doCatalogo);

  try {
    const achado = await buscarPrecoNaSteam(skin, wear);
    if (!achado) {
      console.warn(
        `[preco-de-skin] a Steam não tem anúncio de "${skin.name}" (${wear ?? "sem desgaste"})`,
      );
      return (
        reserva() ?? {
          ok: false,
          semPreco: true,
          erro: "A Steam não tem anúncio desta skin neste desgaste agora. Preencha o preço à mão.",
        }
      );
    }

    const agora = new Date();
    await prisma.$transaction([
      // upsert por (skin, wear) não dá com wear nulo, porque o índice único
      // dele é parcial: o Prisma não enxerga isso como chave.
      prisma.skinPreco.deleteMany({ where: { skinTemplateId, wear } }),
      prisma.skinPreco.create({
        data: {
          skinTemplateId,
          wear,
          brl: achado.brl,
          nomeConsultado: achado.nomeConsultado,
          volume: achado.volume,
          buscadoEm: agora,
        },
      }),
      // O CATÁLOGO APRENDE. Da próxima vez, mesmo com a Steam fora, o painel
      // ainda sugere preço para esta skin.
      prisma.skinTemplate.update({
        where: { id: skinTemplateId },
        data: { skinValueBrl: achado.brl },
      }),
    ]);

    return {
      ok: true,
      brl: achado.brl,
      origem: "steam",
      buscadoEm: agora.toISOString(),
      volume: achado.volume,
    };
  } catch (err) {
    const motivo =
      err instanceof SteamLimitouError
        ? "limite de consultas"
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`[preco-de-skin] falha em "${skin.name}": ${motivo}`);

    const deReserva = reserva();
    if (deReserva) return deReserva;

    return {
      ok: false,
      erro:
        err instanceof SteamLimitouError
          ? `${err.message} Ou preencha o preço à mão.`
          : "Não foi possível falar com a Steam agora. Preencha o preço à mão.",
    };
  }
}

/**
 * O preço guardado, dizendo de onde ele veio.
 *
 * Preço vindo do despejo não é "cache da consulta": é a mediana de sete dias
 * convertida do dólar, e a consulta direta é a mediana de agora. As duas são
 * da Steam e mesmo assim não são o mesmo número, e a tela precisa poder dizer
 * qual está mostrando.
 */
function doGuardado(linha: {
  brl: unknown;
  buscadoEm: Date;
  volume: number | null;
  fonte: string;
}): PrecoSugerido {
  return {
    ok: true,
    brl: Number(linha.brl),
    origem: linha.fonte === "despejo" ? "despejo" : "cache",
    buscadoEm: linha.buscadoEm.toISOString(),
    volume: linha.volume,
  };
}

function comCatalogo(brl: number | null): PrecoSugerido | null {
  if (brl == null || !(brl > 0)) return null;
  return { ok: true, brl, origem: "catalogo", buscadoEm: null, volume: null };
}

/**
 * A mesma busca, achando a skin pelo NOME.
 *
 * Serve à edição do sorteio, que conhece o prêmio (nome e desgaste) mas não o
 * id do item do catálogo: o prêmio guarda uma cópia da ficha, e não uma
 * referência. Procurar pelo nome dentro do painel é o que liga os dois sem
 * inventar uma coluna nova.
 */
export async function precoSugeridoPeloNome(input: {
  nome: string;
  tenantId: string;
  wear: SkinWear | null;
  forcar?: boolean;
}): Promise<PrecoSugerido> {
  const { base, wear } = separarDesgasteDoNome(input.nome, input.wear);
  if (!base) return { ok: false, erro: "O prêmio ainda não tem skin." };

  // Comparação sem caixa: o nome do prêmio é uma cópia digitada em algum
  // momento, e uma letra maiúscula de diferença não pode custar a consulta.
  const skin = await prisma.skinTemplate.findFirst({
    where: {
      tenantId: input.tenantId,
      name: { equals: base, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (!skin) {
    return {
      ok: false,
      erro: `"${base}" não está no catálogo de skins, então não dá para consultar o preço. Cadastre a skin no catálogo ou preencha o preço à mão.`,
    };
  }

  return precoSugeridoDaSkin({
    skinTemplateId: skin.id,
    tenantId: input.tenantId,
    wear,
    forcar: input.forcar,
  });
}

/**
 * Separa "AWP | Asiimov (Field-Tested)" em nome e desgaste.
 *
 * O prêmio guarda o nome COM o acabamento entre parênteses em campanhas
 * antigas, e o catálogo guarda sem: são duas convenções que nasceram em
 * momentos diferentes. Sem esta separação, a busca por nome não achava nada e
 * o painel dizia que a skin não está no catálogo, com ela lá o tempo todo.
 *
 * O desgaste explícito manda. Ele só é deduzido do nome quando não veio, que é
 * exatamente o caso das campanhas antigas.
 */
function separarDesgasteDoNome(
  nome: string,
  wear: SkinWear | null,
): { base: string; wear: SkinWear | null } {
  const limpo = nome.trim();
  const casa = limpo.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!casa) return { base: limpo, wear };

  const dentro = casa[2]!.trim().toLowerCase();
  const achado = (Object.keys(WEAR_STEAM) as SkinWear[]).find(
    (w) => WEAR_STEAM[w].toLowerCase() === dentro,
  );
  // Parêntese que não é desgaste conhecido fica no nome: existe skin cujo nome
  // termina em parênteses por outro motivo.
  if (!achado) return { base: limpo, wear };
  return { base: casa[1]!.trim(), wear: wear ?? achado };
}
