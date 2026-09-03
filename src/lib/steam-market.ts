// O nome de mercado e a leitura do preço da Steam. Só função pura.
//
// A rede mora em server/services/skin-price.ts. A separação existe porque
// estas duas regras (montar o market_hash_name e ler "R$ 1.249,90") são as
// que erram em silêncio, e função pura é o que dá para provar com teste sem
// depender de a Steam estar no ar.

import { separarFaseDaDoppler, WEAR_STEAM } from "@/lib/cs2";
import { lerReais } from "@/lib/dinheiro";
import type { SkinWear } from "@prisma/client";

export interface SkinParaConsulta {
  /** O nome do catálogo, no formato da Steam: "★ Bayonet | Autotronic". */
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
 * O catálogo guarda "★ Stiletto Knife | Doppler Phase 1"; a Steam não tem
 * esse item. Lá a Phase 1 e a Ruby moram na mesma linha e a fase só aparece
 * na inspeção. Perguntar com a fase no nome recebe "não tenho anúncio", e o
 * preço volta vazio. São 182 das 865 skins do catálogo, um quinto delas.
 *
 * O preço que volta para skin de fase é o da faixa toda, não o da fase. Para
 * uma Ruby ele erra para baixo, e por isso é sugestão editável: preço
 * aproximado com procedência é outra coisa que preço nenhum.
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

/** True para faca ou luva sem pintura: começa com a estrela e não tem "|". */
export function ehSemPintura(nome: string): boolean {
  return nome.startsWith("★ ") && !nome.includes("|");
}

/**
 * Lê um preço como a Steam escreve em português: "R$ 1.249,90".
 *
 * Delega para `lerReais`, que é o leitor de dinheiro do projeto inteiro, em
 * vez de um segundo parser só para a Steam. Ele resolve o caso que quebra
 * `parseFloat`: o ponto é separador de MILHAR e a vírgula é o decimal, então
 * `parseFloat("1.249,90")` devolveria 1.249, errando por mil vezes. A regra
 * dele é "o último separador manda", que acerta tanto "1.249,90" quanto
 * "1,249.90" de um sistema em inglês.
 *
 * O espaço depois do "R$" costuma ser não separável (U+00A0), e some junto
 * com o resto do que não é dígito nem separador.
 */
export function precoDaSteamEmReais(
  texto: string | null | undefined,
): number | null {
  if (typeof texto !== "string" || !texto.trim()) return null;
  const valor = lerReais(texto);
  return valor != null && Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** O volume diário que a Steam manda como texto: "1.234" vira 1234. */
export function volumeDaSteam(texto: string | null | undefined): number | null {
  if (typeof texto !== "string") return null;
  const n = Number(texto.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Quanto tempo um preço já consultado continua servindo.
 *
 * Mora aqui, e não no serviço que faz a rede, porque quem PERGUNTA também
 * precisa da resposta: o formulário decide se vale consultar a Steam de novo
 * ao escolher uma skin, e o serviço decide o cache da própria consulta. Dois
 * números para a mesma pergunta dariam um formulário que pede o que o
 * servidor já ia devolver de cache, ou pior, que deixa de pedir o que já
 * venceu.
 */
export const PRECO_VALE_POR_SEGUNDOS = 600;

/**
 * O preço guardado ainda serve, ou vale perguntar de novo?
 *
 * Sem data, não serve: preço sem procedência é palpite, e a consulta é
 * barata perto de publicar uma campanha com valor errado.
 */
export function precoAindaVale(
  atualizadoEm: Date | string | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!atualizadoEm) return false;
  const quando =
    atualizadoEm instanceof Date ? atualizadoEm : new Date(atualizadoEm);
  const ms = quando.getTime();
  if (!Number.isFinite(ms)) return false;
  const idadeEmSegundos = (agora.getTime() - ms) / 1000;
  // Data no futuro é relógio torto, não preço fresco.
  if (idadeEmSegundos < 0) return false;
  return idadeEmSegundos <= PRECO_VALE_POR_SEGUNDOS;
}
