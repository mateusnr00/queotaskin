// Enche o catálogo de preços a partir do despejo público de mercado.
//
// O painel precisa do preço de centenas de skins, 865 no catálogo de hoje.
// Perguntar uma por uma ao Mercado da Comunidade Steam é o que já não funciona:
// a rota deles é por item, não é documentada e é limitada por IP, e um IP de
// datacenter (que é de onde a Vercel fala) é o primeiro a apanhar. Foi assim
// que a primeira campanha criada com skin do catálogo nasceu com o preço no
// padrão.
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
// UMA FONTE SÓ ERA POUCO
//
// A primeira versão apostou num endereço e ele respondeu uma página HTML em vez
// do arquivo, o que virou um erro de JSON na cara de quem clicou. Fonte
// gratuita de terceiro sai do ar e muda de caminho sem avisar. Agora a lista é
// tentada em ordem, a resposta é conferida ANTES de virar JSON, e quando todas
// falham a tela recebe o motivo de cada uma em vez de um erro de sintaxe.
//
// O DÓLAR VIRA REAL NA MESMA COTAÇÃO DO RESTO DO SITE
//
// O despejo cobra em dólar. A conversão usa o mesmo serviço da tela de
// Entregas (AwesomeAPI com PTAX atrás), então o valor de uma skin no catálogo
// e o custo de uma entrega falam a mesma língua.

import type { Prisma, SkinWear } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  cabecalhosDoDespejo,
  chaveDoNome,
  fontesDeDespejo,
  lerNomeDeMercado,
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
      /** Qual fonte respondeu, porque elas são tentadas em ordem. */
      fonte: string;
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

  const tentativa = await baixarDeAlgumaFonte();
  if (!tentativa.ok) return tentativa;
  const { precos, fonte } = tentativa;

  const catalogo = await prisma.skinTemplate.findMany({
    where: { tenantId: input.tenantId },
    select: {
      id: true,
      name: true,
      skinStatTrak: true,
      skinSouvenir: true,
    },
  });

  /** O catálogo indexado pelo nome sem fase, que é como o despejo escreve. */
  const porBase = new Map<
    string,
    { id: string; statTrak: boolean; souvenir: boolean; fase: string | null }[]
  >();
  for (const skin of catalogo) {
    const nome = lerNomeDeMercado(skin.name);
    if (!nome) continue;
    const chave = chaveDoNome(nome.base);
    const lista = porBase.get(chave) ?? [];
    lista.push({
      id: skin.id,
      statTrak: skin.skinStatTrak,
      souvenir: skin.skinSouvenir,
      fase: nome.fase,
    });
    porBase.set(chave, lista);
  }

  interface Achado {
    skinTemplateId: string;
    wear: SkinWear | null;
    brl: number;
    usd: number;
    nome: string;
    volume: number | null;
    /** 1 é preço da fase certa, 2 é o preço sem fase servindo de reserva. */
    prioridade: 1 | 2;
  }
  const encontrados = new Map<string, Achado>();

  function registrar(achado: Achado) {
    const chave = `${achado.skinTemplateId}|${achado.wear ?? ""}`;
    const atual = encontrados.get(chave);
    // O preço da fase certa manda sobre o preço sem fase, sempre. Uma Doppler
    // Ruby e uma Phase 4 moram na mesma linha da Steam e não custam a mesma
    // coisa.
    if (atual && atual.prioridade <= achado.prioridade) return;
    encontrados.set(chave, achado);
  }

  for (const item of precos) {
    const nome = lerNomeDeMercado(item.marketName);
    if (!nome) continue;

    const candidatas = porBase.get(chaveDoNome(nome.base));
    if (!candidatas) continue;

    // A fase pode vir no nome (raro) ou à parte (é como o despejo separa).
    const faseDoItem = item.fase ?? nome.fase;

    for (const skin of candidatas) {
      // StatTrak e Souvenir são outra skin para efeito de preço. Só entram
      // quando o catálogo diz que aquela linha é dessa versão.
      if (nome.statTrak !== skin.statTrak) continue;
      if (nome.souvenir !== skin.souvenir) continue;

      let prioridade: 1 | 2;
      if (faseDoItem) {
        // Linha de fase só serve para a skin daquela fase.
        if (skin.fase !== faseDoItem) continue;
        prioridade = 1;
      } else {
        // Linha sem fase serve direto para a skin sem fase, e de reserva para
        // as com fase: preço da faixa toda é melhor que preço nenhum.
        prioridade = skin.fase ? 2 : 1;
      }

      registrar({
        skinTemplateId: skin.id,
        wear: nome.wear,
        brl: Math.round(item.usd * dolar * 100) / 100,
        usd: Math.round(item.usd * 100) / 100,
        nome: item.marketName,
        volume: item.volume,
        prioridade,
      });
    }
  }

  const linhas = [...encontrados.values()];
  if (linhas.length === 0) {
    return {
      ok: false,
      erro: `A fonte ${fonte} respondeu com ${precos.length} itens, mas nenhum casou com as skins do catálogo. Confira como os nomes estão escritos no catálogo.`,
    };
  }

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
    fonte,
    dolar,
    fonteDoDolar: cambio.cambio.fonte,
  };
}

/**
 * Tenta as fontes em ordem e para na primeira que entregar preço.
 *
 * "Respondeu" não basta: a fonte que quebrou o recurso respondeu 200 com uma
 * página HTML. Só conta a que devolve JSON com pelo menos um preço dentro.
 */
async function baixarDeAlgumaFonte(): Promise<
  { ok: true; precos: PrecoEmLote[]; fonte: string } | { ok: false; erro: string }
> {
  const fontes = fontesDeDespejo(process.env.PRECOS_DESPEJO_URL);
  const falhas: string[] = [];

  for (const fonte of fontes) {
    try {
      const precos = fonte.ler(await baixar(fonte.url));
      if (precos.length === 0) {
        falhas.push(`${fonte.nome}: respondeu em formato inesperado`);
        console.warn(`[precos] ${fonte.nome} respondeu sem preço nenhum`);
        continue;
      }
      console.info(`[precos] ${fonte.nome} respondeu ${precos.length} itens`);
      return { ok: true, precos, fonte: fonte.nome };
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      falhas.push(`${fonte.nome}: ${motivo}`);
      console.error(`[precos] falha em ${fonte.nome}: ${motivo}`);
    }
  }

  return {
    ok: false,
    erro: `Nenhuma fonte de preços respondeu. ${falhas.join("; ")}.`,
  };
}

/**
 * A ida à rede, com fim e com conferência.
 *
 * O arquivo é grande e a função tem tempo limitado: sem o relógio, uma fonte
 * lenta seguraria a requisição até a plataforma derrubar, e a tela mostraria
 * um erro genérico em vez do motivo.
 *
 * O corpo é lido como texto antes de virar JSON de propósito. Fonte que mudou
 * de endereço costuma responder 200 com uma página de erro, e `res.json()`
 * nessa página estoura um "Unexpected token '<'" que não diz nada a quem
 * clicou. Aqui ela vira "respondeu HTML", que diz.
 */
async function baixar(url: string): Promise<unknown> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_EM_MS);
  try {
    const res = await fetch(url, {
      headers: cabecalhosDoDespejo(),
      cache: "no-store",
      signal: controle.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`respondeu ${res.status}`);

    const texto = await res.text();
    const inicio = texto.trimStart().slice(0, 1);
    if (inicio !== "{" && inicio !== "[") throw new Error(motivoDoNaoJson(texto));
    return JSON.parse(texto);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("demorou demais para responder");
    }
    throw err;
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * O que dizer quando a resposta não é JSON.
 *
 * Separar o desafio anti-bot do endereço morto importa: os dois chegam como
 * uma página HTML com status 200, e o conserto de cada um é outro. Um pede
 * cabeçalho de navegador, o outro pede endereço novo.
 */
function motivoDoNaoJson(texto: string): string {
  const inicio = texto.trimStart().slice(0, 1);
  if (inicio !== "<") return "respondeu algo que não é JSON";

  const amostra = texto.slice(0, 4000).toLowerCase();
  const desafio =
    amostra.includes("just a moment") ||
    amostra.includes("cf-browser-verification") ||
    amostra.includes("challenge-platform") ||
    amostra.includes("attention required");
  return desafio
    ? "barrou o acesso com desafio anti-bot"
    : "respondeu uma página HTML em vez do arquivo, o endereço mudou";
}
