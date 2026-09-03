// Preço de uma skin no Mercado da Comunidade Steam, em real.
//
// Rota: /market/priceoverview/?appid=730&currency=7&market_hash_name=…
// O currency=7 é BRL, então o preço já volta na nossa moeda e não passa por
// conversão nenhuma do nosso lado.
//
// ELA NÃO É UMA API OFICIAL.
//
// Não é documentada, não tem contrato e é limitada por IP: passou de algumas
// dezenas de chamadas por minuto, ela passa a responder 429 por um tempo. Isso
// decide o desenho inteiro: nada aqui é chamado durante o carregamento de uma
// página pública. Quem chama é o painel, uma skin por vez, e o resultado fica
// guardado para as próximas.
//
// Escolhemos a mediana, e não o menor preço. O menor é um anúncio só, que
// qualquer um levanta ou derruba sozinho; a mediana é o meio das vendas
// recentes, que é o que responde "quanto essa skin vale".

import { separarFaseDaDoppler, WEAR_STEAM } from "@/lib/cs2";
import type { SkinWear } from "@prisma/client";

const BASE = "https://steamcommunity.com/market/priceoverview";
/** 730 é Counter-Strike 2. */
const APP_CS2 = 730;
/** 7 é BRL na tabela de moedas da Steam. */
const MOEDA_BRL = 7;

export class SteamLimitouError extends Error {
  constructor() {
    super(
      "A Steam está limitando as consultas agora. Espere cerca de um minuto e tente de novo.",
    );
    this.name = "SteamLimitouError";
  }
}

export interface SkinParaConsulta {
  /** O nome do catálogo, que já vem no formato da Steam: "★ Bayonet | Autotronic". */
  name: string;
  skinStatTrak?: boolean;
  skinSouvenir?: boolean;
}

/**
 * Monta o market_hash_name.
 *
 * A ordem dos prefixos não é arbitrária: na Steam o StatTrak vem DEPOIS da
 * estrela ("★ StatTrak™ Karambit | Doppler"), e Souvenir vem antes de tudo,
 * porque item souvenir não é faca nem luva e nunca tem estrela.
 *
 * A FASE DA DOPPLER SAI DAQUI.
 *
 * O catálogo guarda "★ Stiletto Knife | Doppler Phase 1"; a Steam não tem esse
 * item. Lá a Phase 1 e a Ruby moram na mesma linha, "★ Stiletto Knife |
 * Doppler (Factory New)", e a fase só aparece na inspeção. Perguntar com a
 * fase no nome recebia "não tenho anúncio", o painel caía no valor padrão, e a
 * cota nascia em R$ 1,00. Eram 182 das 865 skins do catálogo, um quinto delas,
 * e o sintoma parecia limite de IP quando era nome inexistente.
 *
 * O preço que volta é o da faixa toda, não o da fase. Para uma Ruby ele erra
 * para baixo, e é uma sugestão que o painel deixa editar: preço aproximado com
 * procedência é outra coisa que preço nenhum.
 */
export function nomeDeMercado(
  skin: SkinParaConsulta,
  wear: SkinWear | null,
): string {
  let nome = separarFaseDaDoppler(skin.name).base;

  if (skin.skinStatTrak) {
    nome = nome.startsWith("★ ")
      ? `★ StatTrak™ ${nome.slice(2)}`
      : `StatTrak™ ${nome}`;
  } else if (skin.skinSouvenir) {
    nome = `Souvenir ${nome}`;
  }

  return wear ? `${nome} (${WEAR_STEAM[wear]})` : nome;
}

/**
 * Lê um preço no formato que a Steam devolve em português: "R$ 1.234,56".
 *
 * O espaço depois do "R$" costuma ser não separável ( ), e o ponto é
 * separador de milhar, não decimal. Trocar os dois de lugar transforma
 * R$ 1.234,56 em R$ 1,23, que é o tipo de erro que ninguém percebe olhando.
 */
export function precoEmReais(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const limpo = texto
    .replace(/ /g, " ")
    .replace(/[^\d.,]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

interface RespostaDaSteam {
  success?: boolean;
  lowest_price?: string;
  median_price?: string;
  volume?: string;
}

export interface PrecoDaSteam {
  /** Em reais. */
  brl: number;
  /** O nome exato que a Steam reconheceu, útil quando houve tentativa alternativa. */
  nomeConsultado: string;
  /** Quantas unidades foram vendidas nas últimas 24h, quando a Steam informa. */
  volume: number | null;
  /** True quando a mediana não existia e caímos no menor anúncio. */
  usouMenorPreco: boolean;
}

async function consultar(nome: string): Promise<PrecoDaSteam | null> {
  const url = `${BASE}/?appid=${APP_CS2}&currency=${MOEDA_BRL}&market_hash_name=${encodeURIComponent(nome)}`;
  const res = await fetch(url, {
    headers: {
      // Sem User-Agent de navegador a Steam responde 403 para parte das
      // requisições de servidor.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 429) throw new SteamLimitouError();
  if (!res.ok) {
    throw new Error(`A Steam respondeu ${res.status} ao consultar "${nome}".`);
  }

  const corpo = (await res.json()) as RespostaDaSteam;
  // success:false é a resposta para nome que não existe no mercado. Não é
  // erro de rede nem culpa nossa, é "esse item não está à venda".
  if (!corpo.success) return null;

  const mediana = precoEmReais(corpo.median_price);
  const menor = precoEmReais(corpo.lowest_price);
  const brl = mediana ?? menor;
  if (brl == null) return null;

  return {
    brl,
    nomeConsultado: nome,
    volume: corpo.volume ? Number(corpo.volume.replace(/\D/g, "")) || null : null,
    usouMenorPreco: mediana == null,
  };
}

/** True para faca ou luva sem pintura: começa com a estrela e não tem "|". */
export function ehSemPintura(nome: string): boolean {
  return nome.startsWith("★ ") && !nome.includes("|");
}

/**
 * Busca o preço de uma skin na Steam.
 *
 * Uma discordância entre o catálogo e a Steam vale a tentativa extra: o
 * catálogo trata faca sem pintura como item sem desgaste, e a Steam não, lá
 * uma "★ Bayonet" só existe com o acabamento no nome. Quando o nome pelado não
 * aparece no mercado, tentamos Factory New, que é a versão mais negociada.
 */
export async function buscarPrecoNaSteam(
  skin: SkinParaConsulta,
  wear: SkinWear | null,
): Promise<PrecoDaSteam | null> {
  const nome = nomeDeMercado(skin, wear);
  const achado = await consultar(nome);
  if (achado) return achado;

  if (!wear && ehSemPintura(skin.name)) {
    return consultar(nomeDeMercado(skin, "FACTORY_NEW"));
  }
  return null;
}

/**
 * O preço de cada número, a partir do valor da skin.
 *
 * Arredonda o centavo para cima de propósito. Para baixo, cem números a
 * R$ 12,3456 arrecadariam menos do que a skin custa, e a rifa nasceria no
 * prejuízo por causa de um arredondamento. Para cima, a sobra é de no máximo
 * um centavo por número.
 */
export function precoPorNumero(
  valorDaSkin: number,
  totalDeNumeros: number,
): number | null {
  if (!(valorDaSkin > 0) || !(totalDeNumeros > 0)) return null;
  return Math.ceil((valorDaSkin / totalDeNumeros) * 100) / 100;
}
