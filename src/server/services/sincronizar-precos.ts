// Enche o catálogo de preços a partir do despejo público de mercado.
//
// O painel precisa do preço de centenas de skins. Perguntar uma por uma ao
// Mercado da Comunidade Steam é o que já não funciona: a rota deles é por
// item, não é documentada e é limitada por IP, e um IP de datacenter (que é de
// onde a Vercel fala) é o primeiro a apanhar. Foi assim que a primeira
// campanha criada com skin do catálogo nasceu com o preço no padrão.
//
// A saída é o despejo: uma resposta com o mercado inteiro, cruzada com o
// catálogo de uma vez. Depois disso o painel pergunta o preço de UMA skin e a
// resposta sai do banco, sem depender de ninguém estar no ar naquele segundo.
//
// A RÉGUA CONTINUA SENDO A STEAM
//
// O despejo traz a mediana do Mercado da Steam por janela de tempo, que é
// exatamente o número que a consulta direta daria, só que entregue por um
// caminho que responde a servidor. Não é preço de outro mercado: Buff e
// Skinport vêm no mesmo arquivo e são ignorados de propósito, porque misturar
// mercado com mercado daria um número que não é de lugar nenhum.
//
// GRÁTIS E SEM CHAVE
//
// Não há credencial para guardar, rotacionar ou vazar. É uma decisão de
// operação, não de arquitetura: a fonte paga chegou a ser considerada e ficou
// de fora.
//
// O DÓLAR VIRA REAL NA MESMA COTAÇÃO DO RESTO DO SITE
//
// O despejo cobra em dólar. A conversão usa o mesmo serviço da tela de
// Entregas (AwesomeAPI com PTAX atrás), então o valor de uma skin no catálogo
// e o custo de uma entrega falam a mesma língua.

import type { Prisma, SkinWear } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  chaveDoNome,
  lerDespejoDoCsgotrader,
  lerNomeDeMercado,
  URL_CSGOTRADER,
  type PrecoEmLote,
} from "@/lib/precos-em-lote";
import { cambioDoDia } from "@/server/services/cotacao";

/** O despejo é grande; a rede tem de ter um fim. */
const TIMEOUT_EM_MS = 90_000;

/** Quantas linhas por transação na hora de gravar. */
const LOTE = 200;

export type ResultadoDaSincronizacao =
  | {
      ok: true;
      /** Quantos pares de skin e desgaste ficaram com preço. */
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
  // A cotação vem ANTES do despejo, e de propósito: ela é uma requisição
  // pequena, e sem ela o arquivo inteiro seria baixado para nada.
  const cambio = await cambioDoDia("USD", new Date(), { deHoje: true });
  if (!cambio.cambio) {
    return {
      ok: false,
      erro: "Não foi possível obter a cotação do dólar agora. Tente de novo em alguns minutos.",
    };
  }
  const dolar = cambio.cambio.taxa;

  let precos: PrecoEmLote[];
  try {
    precos = lerDespejoDoCsgotrader(await baixar(URL_CSGOTRADER));
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error("[precos] falha ao baixar o despejo:", motivo);
    return { ok: false, erro: `Não foi possível baixar os preços: ${motivo}` };
  }
  if (precos.length === 0) {
    return {
      ok: false,
      erro: "O despejo de preços veio vazio ou em formato inesperado. Tente de novo em alguns minutos.",
    };
  }

  const catalogo = await prisma.skinTemplate.findMany({
    where: { tenantId: input.tenantId },
    select: {
      id: true,
      name: true,
      skinStatTrak: true,
      skinSouvenir: true,
    },
  });
  const porNome = new Map(catalogo.map((s) => [chaveDoNome(s.name), s]));

  /** Um preço por (skin, desgaste), já em real. */
  const encontrados = new Map<
    string,
    {
      skinTemplateId: string;
      wear: SkinWear | null;
      brl: number;
      usd: number;
      nome: string;
      volume: number | null;
    }
  >();

  for (const item of precos) {
    const nome = lerNomeDeMercado(item.marketName);
    if (!nome) continue;

    const skin = porNome.get(chaveDoNome(nome.base));
    if (!skin) continue;
    // StatTrak e Souvenir são outra skin para efeito de preço. Só entram
    // quando o catálogo diz que aquela linha é dessa versão.
    if (nome.statTrak !== skin.skinStatTrak) continue;
    if (nome.souvenir !== skin.skinSouvenir) continue;

    encontrados.set(`${skin.id}|${nome.wear ?? ""}`, {
      skinTemplateId: skin.id,
      wear: nome.wear,
      brl: Math.round(item.usd * dolar * 100) / 100,
      usd: Math.round(item.usd * 100) / 100,
      nome: item.marketName,
      volume: item.volume,
    });
  }

  const linhas = [...encontrados.values()];
  const agora = new Date();

  // Grava em lotes: são milhares de linhas, e uma transação só seguraria a
  // tabela pelo tempo inteiro da escrita.
  for (let i = 0; i < linhas.length; i += LOTE) {
    const operacoes: Prisma.PrismaPromise<unknown>[] = [];
    for (const linha of linhas.slice(i, i + LOTE)) {
      operacoes.push(
        // upsert por (skin, wear) não dá com wear nulo, porque o índice único
        // dele é parcial: o Prisma não enxerga isso como chave.
        prisma.skinPreco.deleteMany({
          where: { skinTemplateId: linha.skinTemplateId, wear: linha.wear },
        }),
        prisma.skinPreco.create({
          data: {
            skinTemplateId: linha.skinTemplateId,
            wear: linha.wear,
            brl: linha.brl,
            usd: linha.usd,
            fonte: "despejo",
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
    itensNoDespejo: precos.length,
    dolar,
    fonteDoDolar: cambio.cambio.fonte,
  };
}

/**
 * A ida à rede, com fim.
 *
 * O arquivo é grande e a função tem tempo limitado: sem o relógio, uma fonte
 * lenta seguraria a requisição até a plataforma derrubar, e a tela mostraria
 * um erro genérico em vez do motivo.
 */
async function baixar(url: string): Promise<unknown> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_EM_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controle.signal,
    });
    if (!res.ok) throw new Error(`a fonte respondeu ${res.status}.`);
    return await res.json();
  } finally {
    clearTimeout(relogio);
  }
}
