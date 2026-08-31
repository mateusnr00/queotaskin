// Revelar o que já foi decidido.
//
// Mora no serviço, e não dentro da action, por dois motivos. O primeiro é que
// a action tem outro assunto: conferir quem está pedindo, se a reserva está
// paga e se a caixa é mesmo daquela pessoa. O segundo é que esta parte precisa
// de teste contra banco de verdade, e teste não consegue carregar uma action:
// elas puxam a sessão, que puxa o Next inteiro.
//
// Aqui não existe sorteio. O destino da unidade foi decidido na confirmação do
// pagamento (services/alocacao.ts); revelar é virar o status e devolver o que
// está gravado. Duas requisições ao mesmo tempo disputam a mesma linha: uma
// vence, a outra relê, e as duas devolvem a mesma coisa.

import { prisma } from "@/lib/db";

export interface CaixaRevelada {
  status: "OPENED_PRIZE" | "OPENED_EMPTY";
  prize: { id: string; title: string; prize: string } | null;
}

export interface BilheteRevelado {
  status: "PREMIADA" | "SEM_PREMIO";
  premio: {
    id: string;
    tipo: "PIX" | "SKIN";
    rotulo: string;
    valor: number | null;
  } | null;
}

/**
 * Abre uma caixa já alocada.
 *
 * Devolve nulo quando a caixa não existe ou ainda não foi alocada: quem chama
 * decide o que fazer (terminar a alocação, ou seguir pelo caminho legado).
 */
export async function revelarCaixa(
  boxId: string,
): Promise<CaixaRevelada | null> {
  const caixa = await prisma.surpriseBox.findUnique({
    where: { id: boxId },
    select: {
      alocacao: true,
      status: true,
      prize: { select: { id: true, title: true, prize: true } },
    },
  });
  if (!caixa || caixa.alocacao !== "ALOCADA") return null;

  const premiada = caixa.prize != null;
  // A guarda de status é o que torna a operação idempotente: a segunda
  // requisição não encontra UNOPENED, não escreve nada, e cai na releitura
  // logo abaixo com o mesmo resultado.
  await prisma.surpriseBox.updateMany({
    where: { id: boxId, status: "UNOPENED" },
    data: {
      status: premiada ? "OPENED_PRIZE" : "OPENED_EMPTY",
      openedAt: new Date(),
    },
  });

  return premiada
    ? { status: "OPENED_PRIZE", prize: caixa.prize }
    : { status: "OPENED_EMPTY", prize: null };
}

/** O mesmo para o bilhete de raspadinha. */
export async function revelarBilhete(
  bilheteId: string,
): Promise<BilheteRevelado | null> {
  const bilhete = await prisma.raspadinha.findUnique({
    where: { id: bilheteId },
    select: {
      alocacao: true,
      status: true,
      premio: { select: { id: true, tipo: true, rotulo: true, valor: true } },
    },
  });
  if (!bilhete || bilhete.alocacao !== "ALOCADA") return null;

  const premiado = bilhete.premio != null;
  await prisma.raspadinha.updateMany({
    where: { id: bilheteId, status: "DISPONIVEL" },
    data: {
      status: premiado ? "PREMIADA" : "SEM_PREMIO",
      raspadaEm: new Date(),
    },
  });

  return premiado
    ? {
        status: "PREMIADA",
        premio: {
          id: bilhete.premio!.id,
          tipo: bilhete.premio!.tipo,
          rotulo: bilhete.premio!.rotulo,
          valor:
            bilhete.premio!.valor == null
              ? null
              : Number(bilhete.premio!.valor),
        },
      }
    : { status: "SEM_PREMIO", premio: null };
}
