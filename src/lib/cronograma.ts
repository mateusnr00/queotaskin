// As regras do cronograma que não precisam de banco.
//
// Fica no lib, e não no serviço, porque são justamente as decisões que a gente
// quer poder testar sem Postgres: quem é o próximo da fila, se uma campanha
// está pronta para entrar, e como as posições ficam depois de uma reordenação.
// O serviço cuida de transação, trava e escrita; aqui mora o que ele decide.

import type { ScheduleItemStatus } from "@prisma/client";

/** O item da fila, no mínimo que estas funções precisam saber. */
export interface ItemDaFila {
  id: string;
  raffleId: string;
  status: ScheduleItemStatus;
  posicao: number;
}

/**
 * O próximo a entrar no ar.
 *
 * Só AGUARDANDO disputa, e é o de menor posição. PULADO e REMOVIDO são
 * ignorados por definição: pular existe justamente para a fila passar por cima
 * de um item sem tirá-lo do histórico. Empate na posição cai para o id, que é
 * arbitrário mas ESTÁVEL: duas chamadas seguidas precisam escolher o mesmo
 * item, ou dois workers escolheriam campanhas diferentes.
 */
export function proximoDaFila(itens: ItemDaFila[]): ItemDaFila | null {
  const candidatos = itens
    .filter((i) => i.status === "AGUARDANDO")
    .sort((a, b) => a.posicao - b.posicao || a.id.localeCompare(b.id));
  return candidatos[0] ?? null;
}

/** O item que está no ar por conta da fila, se houver. */
export function itemAtivo(itens: ItemDaFila[]): ItemDaFila | null {
  return itens.find((i) => i.status === "ATIVO") ?? null;
}

/**
 * As posições depois de mover um item para outro lugar da lista.
 *
 * Recebe a ordem que a tela produziu (só dos que aguardam) e devolve a lista
 * renumerada de 0 em diante. Renumerar tudo, em vez de trocar dois valores,
 * é o que mantém a fila previsível depois de arrastar: sem isso, uma sequência
 * de trocas deixa buracos e empates, e o desempate por id passa a decidir a
 * ordem no lugar do admin.
 */
export function posicoesRenumeradas(idsNaOrdem: string[]): Map<string, number> {
  const mapa = new Map<string, number>();
  idsNaOrdem.forEach((id, i) => mapa.set(id, i));
  return mapa;
}

/**
 * Troca de lugar com o vizinho, para os botões de subir e descer.
 *
 * Existem porque arrastar não é confiável em toda tela de celular, e a fila
 * precisa ser operável de qualquer aparelho. Devolve a lista inteira na ordem
 * nova; quem está na ponta volta igual, e isso não é erro.
 */
export function moverNaLista(
  idsNaOrdem: string[],
  id: string,
  direcao: "cima" | "baixo",
): string[] {
  const i = idsNaOrdem.indexOf(id);
  if (i < 0) return idsNaOrdem;
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (j < 0 || j >= idsNaOrdem.length) return idsNaOrdem;
  const copia = [...idsNaOrdem];
  [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  return copia;
}

/** O que a validação precisa saber da campanha. */
export interface CampanhaParaFila {
  status: string;
  title: string;
  totalNumbers: number;
  pricePerNumber: number;
  isFree: boolean;
  /** Quantos prêmios cadastrados. É o que a pessoa ganha. */
  premios: number;
  /** Tem capa? Não impede a fila, mas o painel avisa. */
  temCapa: boolean;
  privacy: string;
}

export interface ResultadoDaValidacao {
  /** Impedem a entrada na fila. */
  erros: string[];
  /** Deixam entrar, mas o painel mostra. */
  avisos: string[];
}

/**
 * A campanha está pronta para esperar a vez?
 *
 * A pergunta não é "está bonita", é "se ela for ao ar sozinha às três da manhã,
 * alguma coisa quebra ou fica sem sentido?". Por isso preço e quantidade são
 * erro, e capa é aviso: campanha sem capa desenha o painel com a cor da
 * raridade e o nome da skin, que é feio e funciona.
 *
 * Campanha que já terminou ou foi cancelada não volta para a fila: o ciclo
 * dela acabou, e reativar reabriria venda de um sorteio já sorteado.
 */
export function validarParaFila(c: CampanhaParaFila): ResultadoDaValidacao {
  const erros: string[] = [];
  const avisos: string[] = [];

  if (c.status !== "DRAFT" && c.status !== "QUEUED") {
    erros.push(
      c.status === "ACTIVE"
        ? "A campanha já está no ar."
        : "Campanha encerrada ou cancelada não volta para a fila.",
    );
  }
  if (!c.title.trim()) erros.push("Sem título.");
  if (!Number.isFinite(c.totalNumbers) || c.totalNumbers < 1) {
    erros.push("Quantidade de números inválida.");
  }
  if (!c.isFree && !(c.pricePerNumber > 0)) {
    erros.push("Preço por número precisa ser maior que zero.");
  }
  if (c.premios < 1) {
    erros.push("Sem prêmio cadastrado: ninguém saberia o que está sendo sorteado.");
  }
  if (c.privacy !== "PUBLIC") {
    avisos.push("A campanha é privada: ativar não a coloca na vitrine.");
  }
  if (!c.temCapa) {
    avisos.push("Sem imagem de capa. A página abre, mas sem a foto da skin.");
  }

  return { erros, avisos };
}

/** O rótulo de cada situação na tela do painel. */
export const ROTULO_DO_ITEM: Record<ScheduleItemStatus, string> = {
  AGUARDANDO: "Aguardando",
  ATIVO: "Ativo",
  CONCLUIDO: "Concluído",
  PULADO: "Pulado",
  REMOVIDO: "Removido",
  FALHOU: "Falhou",
};

/**
 * Quando o próximo pode entrar, dado o fim do anterior.
 *
 * O atraso conta a partir do FIM de verdade, e não do esgotamento das cotas:
 * entre uma coisa e outra existe a transmissão inteira, que pode levar dez
 * minutos. Sem carimbo de fim, a resposta é "agora": é o caso da fila que
 * nunca teve um sorteio antes.
 */
export function liberadoEm(
  concluidoEm: Date | null,
  atrasoEmSegundos: number,
): Date | null {
  if (!concluidoEm) return null;
  return new Date(concluidoEm.getTime() + Math.max(0, atrasoEmSegundos) * 1000);
}
