// O preço de referência de uma skin, por trás de uma fonte trocável.
//
// A FONTE É PEÇA, NÃO É ARQUITETURA
//
// Este projeto já perdeu duas fontes de preço em um dia: um despejo público
// que virou página HTML e outro que passou a responder 403 para IP de
// datacenter. A consulta por item da Steam tem o mesmo risco: a rota não é
// oficial, não tem contrato e limita por IP, e há 429 dela no log de produção.
//
// Por isso a tela não conhece a Steam. Ela conhece `precoDaSkinNoMercado`,
// que pergunta ao provider ativo. Trocar a fonte é escrever outro provider e
// mudar `PROVIDER_ATIVO`, sem tocar no formulário de sorteio.
//
// A CHAMADA É SEMPRE DAQUI
//
// Nunca do navegador. Dois motivos: a Steam limita por IP, e um preço que
// chega pelo formulário é um número que o cliente escolheu. O que o navegador
// manda é o nome da skin; o preço volta do servidor.
//
// O CACHE É O DO NEXT
//
// `next: { revalidate }` no fetch, que é o mesmo mecanismo que a cotação do
// dólar já usa neste projeto. A chave é a própria URL, que carrega o
// market_hash_name, então dois admins pedindo a mesma skin dentro da janela
// batem uma vez só na Steam. Não há Redis aqui, e introduzir um só para isto
// seria infraestrutura nova para um problema que a plataforma já resolve.

import {
  ehSemPintura,
  nomeDeMercado,
  precoDaSteamEmReais,
  volumeDaSteam,
  type SkinParaConsulta,
} from "@/lib/steam-market";
import type { SkinWear } from "@prisma/client";

/** Quanto tempo um preço serve antes de valer perguntar de novo. */
export const CACHE_EM_SEGUNDOS = 600;

/** A rede tem de ter fim: ninguém segura o formulário esperando a Steam. */
const TIMEOUT_EM_MS = 8000;

/**
 * O motivo da falha, distinguido no servidor.
 *
 * São cinco e não um porque o conserto de cada um é outro: limite pede
 * espera, bloqueio pede trocar de fonte, "não encontrado" pede conferir o
 * nome, e resposta inválida pede olhar se o endpoint mudou. A tela traduz
 * todos para uma frase; o log guarda o código.
 */
export type MotivoDaFalha =
  | "PRICE_NOT_FOUND"
  | "PRICE_PROVIDER_RATE_LIMIT"
  | "PRICE_PROVIDER_BLOCKED"
  | "PRICE_PROVIDER_TIMEOUT"
  | "PRICE_PROVIDER_UNAVAILABLE"
  | "INVALID_PROVIDER_RESPONSE";

export interface PrecoDeMercado {
  marketHashName: string;
  /** O menor anúncio, em reais. É a referência escolhida. */
  lowestPriceBrl: number;
  /** A mediana das vendas recentes, quando a fonte informa. */
  medianPriceBrl: number | null;
  volume: number | null;
  fetchedAt: Date;
  /** Qual fonte respondeu, para a tela e para a auditoria. */
  provider: string;
}

export type ResultadoDoPreco =
  | { ok: true; preco: PrecoDeMercado }
  | { ok: false; motivo: MotivoDaFalha; mensagem: string };

/**
 * O contrato de uma fonte de preço.
 *
 * Quem implementar isto vira fonte sem que a tela saiba. É o ponto de troca
 * que este projeto já precisou usar mais de uma vez.
 */
export interface SkinPriceProvider {
  readonly nome: string;
  buscar(
    marketHashName: string,
    opcoes?: { forcar?: boolean },
  ): Promise<ResultadoDoPreco>;
}

// ---------------------------------------------------------------------------
// Steam Community Market
// ---------------------------------------------------------------------------

/**
 * O endereço da consulta.
 *
 * `STEAM_MARKET_BASE_URL` existe como costura: serve para apontar a consulta
 * a um espelho ou a um dublê na hora de verificar a tela sem depender de a
 * Steam estar alcançável. Vazia, que é o normal, vale o endereço real.
 *
 * É variável de SERVIDOR. Nunca entra em log e nunca volta para a tela, pelo
 * mesmo motivo de sempre: endereço configurável pode carregar credencial.
 */
const STEAM_BASE =
  process.env.STEAM_MARKET_BASE_URL?.trim() ||
  "https://steamcommunity.com/market/priceoverview";
/** 730 é Counter-Strike 2. */
const APP_CS2 = 730;
/** 7 é BRL na tabela de moedas da Steam, então o preço já volta em real. */
const MOEDA_BRL = 7;

interface RespostaDaSteam {
  success?: boolean;
  lowest_price?: string;
  median_price?: string;
  volume?: string;
}

export const SteamMarketProvider: SkinPriceProvider = {
  nome: "Steam Community Market",

  async buscar(marketHashName, opcoes) {
    const url = `${STEAM_BASE}/?appid=${APP_CS2}&currency=${MOEDA_BRL}&market_hash_name=${encodeURIComponent(
      marketHashName,
    )}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          // Sem User-Agent de navegador a Steam responde 403 para parte das
          // requisições que saem de servidor.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TIMEOUT_EM_MS),
        // Forçar é o botão "Atualizar preço": ele existe para furar o cache.
        ...(opcoes?.forcar
          ? { cache: "no-store" as const }
          : { next: { revalidate: CACHE_EM_SEGUNDOS } }),
      });
    } catch (err) {
      const abortou =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError");
      return abortou
        ? {
            ok: false,
            motivo: "PRICE_PROVIDER_TIMEOUT",
            mensagem:
              "A Steam demorou demais para responder. Preencha o preço à mão ou tente de novo.",
          }
        : {
            ok: false,
            motivo: "PRICE_PROVIDER_UNAVAILABLE",
            mensagem:
              "Não foi possível falar com a Steam agora. Preencha o preço à mão.",
          };
    }

    if (res.status === 429) {
      return {
        ok: false,
        motivo: "PRICE_PROVIDER_RATE_LIMIT",
        mensagem:
          "A Steam está limitando as consultas agora. Espere cerca de um minuto, ou preencha o preço à mão.",
      };
    }
    // 403 e 401 são BLOQUEIO, e bloqueio não é "fonte fora do ar": é a fonte
    // recusando este chamador. A diferença decide o conserto, e foi
    // exatamente ela que matou as duas fontes de despejo deste projeto: uma
    // respondia 403 a IP de datacenter e não ia voltar sozinha.
    if (res.status === 403 || res.status === 401) {
      return {
        ok: false,
        motivo: "PRICE_PROVIDER_BLOCKED",
        mensagem:
          "A Steam recusou a consulta feita pelo servidor. Preencha o preço à mão.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        motivo: "PRICE_PROVIDER_UNAVAILABLE",
        mensagem: `A Steam respondeu ${res.status}. Preencha o preço à mão.`,
      };
    }

    let corpo: RespostaDaSteam;
    try {
      corpo = (await res.json()) as RespostaDaSteam;
    } catch {
      return {
        ok: false,
        motivo: "INVALID_PROVIDER_RESPONSE",
        mensagem:
          "A Steam respondeu em formato inesperado. Preencha o preço à mão.",
      };
    }

    // success:false é a resposta para nome que não existe no mercado. Não é
    // erro de rede nem culpa nossa, é "esse item não está à venda".
    if (!corpo || corpo.success !== true) {
      return {
        ok: false,
        motivo: "PRICE_NOT_FOUND",
        mensagem:
          "Não foi possível encontrar o preço dessa skin na Steam. Confira o nome ou preencha o preço à mão.",
      };
    }

    const lowest = precoDaSteamEmReais(corpo.lowest_price);
    const median = precoDaSteamEmReais(corpo.median_price);
    // Sem menor preço, a mediana serve: item de pouco giro às vezes tem
    // histórico e nenhum anúncio aberto naquele instante.
    const referencia = lowest ?? median;
    if (referencia == null) {
      return {
        ok: false,
        motivo: "PRICE_NOT_FOUND",
        mensagem:
          "A Steam respondeu sem preço para essa skin agora. Preencha o preço à mão.",
      };
    }

    return {
      ok: true,
      preco: {
        marketHashName,
        lowestPriceBrl: referencia,
        medianPriceBrl: median,
        volume: volumeDaSteam(corpo.volume),
        fetchedAt: new Date(),
        provider: SteamMarketProvider.nome,
      },
    };
  },
};

/** A fonte em uso. Trocar de fonte é trocar esta linha. */
const PROVIDER_ATIVO: SkinPriceProvider = SteamMarketProvider;

/**
 * O preço de uma skin do catálogo, montando o nome de mercado por aqui.
 *
 * O nome NUNCA vem pronto do navegador: ele é derivado da skin que está no
 * banco, com o desgaste escolhido. Aceitar o nome de fora deixaria o cliente
 * escolher o item consultado.
 *
 * A tentativa extra existe por uma discordância real entre o catálogo e a
 * Steam: aqui faca sem pintura é item sem desgaste, e lá uma "★ Bayonet" só
 * existe com o acabamento no nome.
 */
export async function precoDaSkinNoMercado(input: {
  skin: SkinParaConsulta;
  wear: SkinWear | null;
  forcar?: boolean;
}): Promise<ResultadoDoPreco> {
  const nome = nomeDeMercado(input.skin, input.wear);
  const primeira = await PROVIDER_ATIVO.buscar(nome, { forcar: input.forcar });
  if (primeira.ok || primeira.motivo !== "PRICE_NOT_FOUND") return primeira;

  if (!input.wear && ehSemPintura(input.skin.name)) {
    return PROVIDER_ATIVO.buscar(nomeDeMercado(input.skin, "FACTORY_NEW"), {
      forcar: input.forcar,
    });
  }
  return primeira;
}
