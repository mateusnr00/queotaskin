// Enche o catálogo de preços a partir do despejo da SteamAnalyst.
//
// A rota deles devolve TODOS os itens numa resposta só, então ela não serve
// para perguntar o preço de uma skin: serve para abastecer o catálogo inteiro
// de uma vez. Depois disso, o painel pergunta o preço de UMA skin e a resposta
// sai do banco, sem depender de ninguém estar no ar naquele segundo.
//
// É o oposto do Mercado da Comunidade Steam, que é consulta por item, limitada
// por IP e sem contrato. As duas convivem: a Steam continua sendo a fonte viva
// quando responde, e este despejo é o chão que sustenta o painel quando ela
// não responde.
//
// A CHAVE NÃO MORA NO CÓDIGO
//
// Ela vem de STEAMANALYST_API_KEY, e é a URL inteira que é secreta: a chave
// vai no CAMINHO da rota, não num header. Por isso a URL nunca é registrada em
// log, nem em erro, nem em mensagem de tela.
//
// O DÓLAR VIRA REAL NA MESMA COTAÇÃO DO RESTO DO SITE
//
// A SteamAnalyst cobra em dólar. A conversão usa o mesmo serviço da tela de
// Entregas (AwesomeAPI com PTAX atrás), então o valor de uma skin no catálogo
// e o custo de uma entrega falam a mesma língua.

import type { Prisma, SkinWear } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  BASE_STEAMANALYST,
  chaveDoNome,
  lerNomeDeMercado,
  precoDoItem,
  type ItemDaSteamAnalyst,
} from "@/lib/steamanalyst";
import { cambioDoDia } from "@/server/services/cotacao";

/** O despejo é grande; a rede tem de ter um fim. */
const TIMEOUT_EM_MS = 90_000;

/** Quantas linhas por transação na hora de gravar. */
const LOTE = 200;

export type ResultadoDaSincronizacao =
  | {
      ok: true;
      /** Quantos itens do despejo casaram com o catálogo. */
      atualizados: number;
      /** Quantas skins do catálogo ficaram com pelo menos um preço. */
      skinsComPreco: number;
      /** Quantos itens vieram no despejo. */
      itensNoDespejo: number;
      /** A cotação usada, para a tela poder mostrar. */
      dolar: number;
      fonteDoDolar: string;
    }
  | { ok: false; erro: string };

/**
 * Baixa o despejo e grava o que casa com o catálogo do painel.
 *
 * Só toca em skin que já está no catálogo: o despejo tem o mercado inteiro do
 * CS2, e cadastrar skin é decisão de quem opera, não do preço existir.
 */
export async function sincronizarPrecosDoCatalogo(input: {
  tenantId: string;
}): Promise<ResultadoDaSincronizacao> {
  const chave = process.env.STEAMANALYST_API_KEY?.trim();
  if (!chave) {
    return {
      ok: false,
      erro: "Falta a chave da SteamAnalyst. Configure STEAMANALYST_API_KEY no Vercel.",
    };
  }

  const cambio = await cambioDoDia("USD", new Date(), { deHoje: true });
  if (!cambio.cambio) {
    return {
      ok: false,
      erro: "Não foi possível obter a cotação do dólar agora. Tente de novo em alguns minutos.",
    };
  }
  const dolar = cambio.cambio.taxa;

  let itens: ItemDaSteamAnalyst[];
  try {
    itens = await baixarDespejo(chave);
  } catch (err) {
    // A mensagem do erro nunca carrega a URL: a chave está dentro dela.
    const motivo = err instanceof Error ? err.message : String(err);
    console.error("[steamanalyst] falha ao baixar o despejo:", motivo);
    return { ok: false, erro: `Não foi possível baixar os preços: ${motivo}` };
  }

  const catalogo = await prisma.skinTemplate.findMany({
    where: { tenantId: input.tenantId },
    select: {
      id: true,
      name: true,
      skinWears: true,
      skinStatTrak: true,
      skinSouvenir: true,
    },
  });
  const porNome = new Map(catalogo.map((s) => [chaveDoNome(s.name), s]));

  /** Um preço por (skin, desgaste), já em real. */
  const encontrados = new Map<
    string,
    { skinTemplateId: string; wear: SkinWear | null; brl: number; usd: number; nome: string; volume: number | null }
  >();

  for (const item of itens) {
    if (!item.market_name) continue;
    const nome = lerNomeDeMercado(item.market_name);
    if (!nome) continue;

    const skin = porNome.get(chaveDoNome(nome.base));
    if (!skin) continue;
    // StatTrak e Souvenir são outra skin para efeito de preço. Só entram
    // quando o catálogo diz que aquela linha é dessa versão.
    if (nome.statTrak !== skin.skinStatTrak) continue;
    if (nome.souvenir !== skin.skinSouvenir) continue;

    const preco = precoDoItem(item);
    if (!preco) continue;

    const chaveLocal = `${skin.id}|${nome.wear ?? ""}`;
    encontrados.set(chaveLocal, {
      skinTemplateId: skin.id,
      wear: nome.wear,
      brl: Math.round(preco.usd * dolar * 100) / 100,
      usd: Math.round(preco.usd * 100) / 100,
      nome: item.market_name,
      volume: preco.volume,
    });
  }

  const linhas = [...encontrados.values()];
  const agora = new Date();

  // Grava em lotes: são milhares de linhas, e uma transação só seguraria a
  // tabela pelo tempo inteiro da escrita.
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const operacoes: Prisma.PrismaPromise<unknown>[] = [];
    for (const linha of lote) {
      operacoes.push(
        prisma.skinPreco.deleteMany({
          where: { skinTemplateId: linha.skinTemplateId, wear: linha.wear },
        }),
        prisma.skinPreco.create({
          data: {
            skinTemplateId: linha.skinTemplateId,
            wear: linha.wear,
            brl: linha.brl,
            usd: linha.usd,
            fonte: "steamanalyst",
            nomeConsultado: linha.nome,
            volume: linha.volume,
            buscadoEm: agora,
          },
        }),
      );
    }
    await prisma.$transaction(operacoes);
  }

  // O valor de referência da skin, para quando não houver preço do desgaste
  // exato. Field-Tested manda, por ser o acabamento mais sorteado; sem ele, o
  // MENOR encontrado, que erra para baixo em vez de inflar a cota.
  const porSkin = new Map<string, { ft: number | null; menor: number }>();
  for (const linha of linhas) {
    const atual = porSkin.get(linha.skinTemplateId);
    const ft = linha.wear === "FIELD_TESTED" ? linha.brl : null;
    if (!atual) {
      porSkin.set(linha.skinTemplateId, { ft, menor: linha.brl });
      continue;
    }
    porSkin.set(linha.skinTemplateId, {
      ft: atual.ft ?? ft,
      menor: Math.min(atual.menor, linha.brl),
    });
  }

  const skins = [...porSkin.entries()];
  for (let i = 0; i < skins.length; i += LOTE) {
    await prisma.$transaction(
      skins.slice(i, i + LOTE).map(([id, valores]) =>
        prisma.skinTemplate.update({
          where: { id },
          data: { skinValueBrl: valores.ft ?? valores.menor },
        }),
      ),
    );
  }

  return {
    ok: true,
    atualizados: linhas.length,
    skinsComPreco: porSkin.size,
    itensNoDespejo: itens.length,
    dolar,
    fonteDoDolar: cambio.cambio.fonte,
  };
}

/**
 * Baixa e normaliza o despejo.
 *
 * A resposta pode vir como lista ou como objeto com o nome do item na chave, e
 * a documentação mostra só o formato de UM item. Aceitar as duas formas é mais
 * barato que descobrir isso em produção, num sábado, com o catálogo vazio.
 */
async function baixarDespejo(chave: string): Promise<ItemDaSteamAnalyst[]> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_EM_MS);
  try {
    const res = await fetch(`${BASE_STEAMANALYST}/${encodeURIComponent(chave)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controle.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("a chave foi recusada (401/403). Confira o valor no Vercel.");
    }
    if (!res.ok) throw new Error(`a API respondeu ${res.status}.`);

    const corpo: unknown = await res.json();
    if (Array.isArray(corpo)) return corpo as ItemDaSteamAnalyst[];
    if (corpo && typeof corpo === "object") {
      return Object.entries(corpo as Record<string, ItemDaSteamAnalyst>).map(
        ([chaveDoItem, item]) =>
          item && typeof item === "object"
            ? { market_name: item.market_name ?? chaveDoItem, ...item }
            : { market_name: chaveDoItem },
      );
    }
    throw new Error("a resposta não veio no formato esperado.");
  } finally {
    clearTimeout(relogio);
  }
}
