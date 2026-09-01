// Serviço de reservas, coração da concorrência do sistema.
//
// COMO EVITAMOS VENDA DUPLA DE NÚMEROS:
//
// 1. A tabela Ticket tem @@unique([raffleId, number]). O banco GARANTE que
//    não existam duas linhas com o mesmo (raffleId, number). Esse é o lock real.
//
// 2. Tentamos inserir todos os tickets dentro de uma transação Prisma. Se UM
//    INSERT falha com erro de unique constraint (P2002), a transação inteira
//    rola pra trás, nenhum ticket é criado, nenhuma reserva é gravada.
//
// 3. Depois do erro, fazemos uma query separada pra descobrir QUAIS números
//    estão tomados e devolvemos isso pra UI mostrar uma mensagem útil ao
//    participante ("os números 5, 12 já foram reservados, escolha outros").
//
// Não usamos `SELECT FOR UPDATE` porque o Prisma não expõe row-level locks
// elegantes, e a unique constraint resolve o problema de forma mais simples
// e mais portável.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { onlyDigits } from "@/lib/cpf";
import {
  NotFoundError,
  ReservationConflictError,
  ValidationError,
} from "@/lib/errors";
import type { CreateReservationInput } from "@/lib/validations/raffle";
import { pickAvailableNumbers } from "@/server/services/raffles";
import { bilhetesDe, dobroAtivo } from "@/lib/promocao-em-dobro";
import {
  amarrarCupomNaCompra,
  liberarEntradaGratis,
  reivindicarCupomDaCompra,
} from "@/server/services/afiliados";
import { descontoDoCupom, emCentavos, emReais } from "@/lib/afiliados";

// Expira reservas PENDING da rifa específica que já passaram do expiresAt.
// Chamada antes de cada createReservation pra liberar números rapidamente
// SEM esperar o cron rodar. Indexada por (status, expiresAt) e raffleId.
export async function expireForRaffle(
  raffleId: string,
  now: Date = new Date()
): Promise<number> {
  const expired = await prisma.reservation.findMany({
    where: {
      raffleId,
      status: "PENDING",
      expiresAt: { lt: now },
    },
    select: { id: true },
    take: 100,
  });
  if (expired.length === 0) return 0;

  const ids = expired.map((r) => r.id);
  await prisma.$transaction([
    prisma.ticket.deleteMany({ where: { reservationId: { in: ids } } }),
    prisma.reservation.updateMany({
      where: { id: { in: ids } },
      data: { status: "EXPIRED" },
    }),
  ]);
  // A Entrada Grátis presa a um Pix que nunca foi pago volta para o saldo.
  // Sem isto, quem gera cobrança e não paga perde o benefício, e nada além do
  // suporte traria ele de volta.
  for (const id of ids) await liberarEntradaGratis(id);
  return expired.length;
}

// Expira UMA reserva específica se ela já passou do expiresAt. Chamada na
// página do comprovante pra evitar o estado híbrido "countdown zerou no
// cliente mas servidor ainda diz PENDING". Idempotente: se já está EXPIRED
// (ou em qualquer status terminal), retorna false sem tocar em nada.
export async function expireReservationIfDue(
  reservationId: string,
  now: Date = new Date()
): Promise<boolean> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!reservation) return false;
  if (reservation.status !== "PENDING") return false;
  if (reservation.expiresAt > now) return false;

  await prisma.$transaction([
    prisma.ticket.deleteMany({ where: { reservationId } }),
    prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "EXPIRED" },
    }),
  ]);
  await liberarEntradaGratis(reservationId);
  return true;
}

// Calcula quantos tickets uma reserva DEVERIA ter (com base no valor total
// e preço por número) e pega N números aleatórios disponíveis na rifa.
// Usado pra "ressuscitar" tickets quando a reserva foi marcada PAID após
// ter expirado (cron deletou os tickets originais).
//
// Retorna [] se a rifa é grátis ou se a conta não bate. Lança se não há
// números suficientes disponíveis (rifa lotou).
export async function computeTicketsToRecreate(
  reservationId: string
): Promise<number[]> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      totalAmount: true,
      dobroAplicado: true,
      // A cota coberta pela Entrada Grátis não está no valor: sem somá-la de
      // volta, a reserva ressuscitada voltaria com um número a menos do que
      // a pessoa comprou.
      entradasGratis: { select: { id: true }, take: 1 },
      raffle: {
        select: {
          id: true,
          totalNumbers: true,
          pricePerNumber: true,
          feeAmount: true,
          hasFee: true,
          isFree: true,
        },
      },
    },
  });
  if (!reservation) return [];

  const fee =
    reservation.raffle.hasFee && reservation.raffle.feeAmount
      ? Number(reservation.raffle.feeAmount)
      : 0;
  const pricePerNumber = reservation.raffle.isFree
    ? 0
    : Number(reservation.raffle.pricePerNumber);
  if (pricePerNumber <= 0) return [];

  const pagas =
    Math.round((Number(reservation.totalAmount) - fee) / pricePerNumber) +
    reservation.entradasGratis.length;
  if (pagas <= 0) return [];

  // O valor pago só conta as cotas compradas. Quem comprou durante a promoção
  // recebeu o dobro, e recriar pelo valor devolveria metade dos números.
  const qty = bilhetesDe(pagas, reservation.dobroAplicado);

  return pickAvailableNumbers(
    reservation.raffle.id,
    qty,
    reservation.raffle.totalNumbers
  );
}

/**
 * A compra, com a Entrada Grátis opcional.
 *
 * `usarEntradaDe` é o id do afiliado que vai gastar a entrada, e não um
 * booleano do formulário: quem chama já conferiu quem é a pessoa, se ela tem
 * entrada e se ainda não usou naquele sorteio. O que chega do navegador nunca
 * decide desconto.
 */
export async function createReservation(
  input: CreateReservationInput & {
    usarEntradaDe?: string | null;
    /** Qual cupom, escolhido pela pessoa. Cupons podem ter valores diferentes. */
    cupomId?: string | null;
  },
) {
  // 0. ANTES de tudo: libera números de reservas que já expiraram nessa rifa.
  // Custo: 1 query indexada. Se nada expirou, retorna imediatamente.
  // Garante que números pendentes vencidos virem disponíveis pro próximo
  // comprador, sem depender do cron de 5min.
  await expireForRaffle(input.raffleId);

  // 1. Carrega a rifa e valida estado.
  const raffle = await prisma.raffle.findUnique({
    where: { id: input.raffleId },
  });
  if (!raffle) throw new NotFoundError("Rifa");
  if (raffle.status !== "ACTIVE") {
    throw new ValidationError("Esta rifa não está disponível para venda");
  }

  // 2. Valida que os números estão dentro do intervalo da rifa.
  const out = input.numbers.filter(
    (n) => n < 1 || n > raffle.totalNumbers
  );
  if (out.length > 0) {
    throw new ValidationError(
      `Números fora do intervalo (1 a ${raffle.totalNumbers}): ${out.join(", ")}`
    );
  }

  // 3. Valida limites min/max por reserva.
  if (input.numbers.length < raffle.minPurchase) {
    throw new ValidationError(
      `Mínimo ${raffle.minPurchase} número(s) por reserva`
    );
  }
  if (raffle.maxPurchase && input.numbers.length > raffle.maxPurchase) {
    throw new ValidationError(
      `Máximo ${raffle.maxPurchase} número(s) por reserva`
    );
  }

  // 4. Calcula valores. Quando a rifa está marcada como grátis, o preço
  //    efetivo é zero, mesmo se pricePerNumber tiver algum valor residual
  //    (admin pode ter mudado de paga pra grátis sem zerar o campo).
  const pricePerNumber = raffle.isFree ? 0 : Number(raffle.pricePerNumber);
  // O valor é o das cotas escolhidas. A promoção em dobro NÃO entra aqui: ela
  // muda quantos números saem, nunca quanto se paga.
  const bruto = pricePerNumber * input.numbers.length;

  // A ENTRADA GRÁTIS COBRE UMA COTA, NÃO R$ 10.
  //
  // O desconto é o preço de UM número desta campanha: numa de R$ 1 ela vale
  // R$ 1, numa de R$ 25 vale R$ 25, e nas duas a pessoa recebe a mesma coisa,
  // uma cota. A quantidade de números não muda; o que muda é o quanto se paga.
  //
  // Descontar aqui, no valor gravado, é o que faz o resto do sistema
  // continuar certo sozinho: o Pix cobra o que ficou, e o programa de
  // afiliados, que lê totalAmount, credita só o dinheiro que entrou de
  // verdade. Entrada Grátis não gera Entrada Grátis para ninguém.
  //
  // O cupom abate ATÉ o valor de face dele, em UMA cota:
  //
  //   cota de R$ 2 com cupom de R$ 5   abate R$ 2, e os R$ 3 se perdem
  //   cota de R$ 12 com cupom de R$ 5  abate R$ 5, e a pessoa paga R$ 7
  //
  // Não existe troco, saldo, divisão entre cotas nem soma de cupons. E não
  // existe teto de preço de cota: campanha cara aceita cupom do mesmo jeito,
  // cobrando a diferença.
  const usaCupom = Boolean(input.usarEntradaDe && input.cupomId) && pricePerNumber > 0;
  if (usaCupom && !raffle.aceitaCupomDeAfiliado) {
    throw new ValidationError(
      "Esta campanha não aceita Cupom de Entrada.",
    );
  }
  const totalAmountSemCupom = bruto;
  const now = new Date();

  // 4b. Promoção em dobro: sorteia os números extras agora, antes da
  //     transação, e decide uma vez só. Consultar a janela mais de uma vez
  //     durante a compra deixaria a virada da hora cair no meio de um pedido.
  const comDobro = dobroAtivo(
    {
      ativa: raffle.promotionsDoubleEnabled,
      inicio: raffle.promotionsDoubleFrom,
      fim: raffle.promotionsDoubleUntil,
    },
    now
  );
  let numerosExtras: number[] = [];
  if (comDobro) {
    try {
      // Os escolhidos ainda não estão na tabela, então o sorteio pode repetir
      // um deles. O filtro aqui embaixo é o que impede isso, e por isso pedimos
      // com folga antes de cortar.
      const escolhidos = new Set(input.numbers);
      const sorteados = await pickAvailableNumbers(
        raffle.id,
        Math.min(
          input.numbers.length * 2,
          raffle.totalNumbers
        ),
        raffle.totalNumbers
      );
      numerosExtras = sorteados
        .filter((n) => !escolhidos.has(n))
        .slice(0, input.numbers.length);
    } catch {
      // Sem números livres suficientes para dobrar, a compra continua sem a
      // promoção. Recusar a venda porque o brinde não coube seria pior.
      numerosExtras = [];
    }
  }
  const dobroAplicado = numerosExtras.length > 0;
  const expiresAt = new Date(
    now.getTime() + raffle.reservationTimeoutMinutes * 60_000
  );

  // 5. Transação: cria reserva + tickets. Se qualquer ticket colidir, rolla tudo.
  //    Reservas grátis pulam o ciclo PENDING → PIX → PAID: já nascem PAID
  //    com os tickets PAID e paidAt agora, não tem o que cobrar, não tem
  //    countdown, não tem cobrança Pix. O job de expiração ignora qualquer
  //    coisa que não esteja PENDING, então a reserva fica garantida pra
  //    sempre. A UI do comprovante já detecta PAID e renderiza a tela
  //    comemorativa, sem código extra.
  try {
    return await prisma.$transaction(async (tx) => {
      // O CUPOM É REIVINDICADO ANTES DA COMPRA EXISTIR.
      //
      // É ele que decide quanto a compra vai custar: sem saber o valor de face
      // do cupom que a pessoa escolheu, o total sairia errado. Reivindicar
      // primeiro, dentro da mesma transação, garante que ou as duas coisas
      // acontecem, ou nenhuma. Se o cupom não for dela, ou já tiver sido gasto
      // entre a tela e o clique, a compra inteira volta atrás.
      let cupom: { id: string; valorEmCentavos: number } | null = null;
      if (usaCupom && input.usarEntradaDe && input.cupomId) {
        cupom = await reivindicarCupomDaCompra(
          tx,
          input.usarEntradaDe,
          input.cupomId,
        );
      }

      const desconto = cupom
        ? emReais(
            descontoDoCupom({
              precoDaCotaEmCentavos: emCentavos(pricePerNumber),
              valorDoCupomEmCentavos: cupom.valorEmCentavos,
            }).descontoEmCentavos,
          )
        : 0;
      const totalAmount = Math.max(0, totalAmountSemCupom - desconto);
      const isFreeReservation = totalAmount <= 0;

      const reservation = await tx.reservation.create({
        data: {
          raffleId: raffle.id,
          participantName: input.participantName.trim(),
          participantPhone: input.participantPhone
            ? onlyDigits(input.participantPhone)
            : null,
          participantCpf: input.participantCpf
            ? onlyDigits(input.participantCpf)
            : null,
          participantEmail: input.participantEmail ?? null,
          totalAmount,
          dobroAplicado,
          expiresAt,
          status: isFreeReservation ? "PAID" : "PENDING",
          paidAt: isFreeReservation ? now : null,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          utmContent: input.utmContent ?? null,
        },
      });

      const comoTicket = (number: number) => ({
        raffleId: raffle.id,
        number,
        status: isFreeReservation ? ("PAID" as const) : ("RESERVED" as const),
        reservationId: reservation.id,
        paidAt: isFreeReservation ? now : null,
      });

      // Os escolhidos entram sem tolerância: colidiu, a compra inteira volta
      // atrás e a pessoa escolhe de novo. É o que ela pediu e pagou.
      await tx.ticket.createMany({ data: input.numbers.map(comoTicket) });

      // Os bônus entram com `skipDuplicates`, e a diferença é deliberada.
      // Foram sorteados antes da transação, então alguém pode ter levado um
      // deles nesse intervalo. Derrubar a venda inteira porque um número de
      // brinde colidiu seria punir o comprador por causa do presente: aqui o
      // que colidiu simplesmente não entra, e o resto do pedido segue.
      if (numerosExtras.length > 0) {
        await tx.ticket.createMany({
          data: numerosExtras.map(comoTicket),
          skipDuplicates: true,
        });
      }

      // Agora que a compra existe, o cupom é amarrado a ela. Compra que já
      // nasce paga (total zerado) gasta o cupom na hora; a que espera Pix
      // apenas reserva, e a reserva volta ao saldo se expirar.
      if (cupom && input.usarEntradaDe) {
        await amarrarCupomNaCompra(
          tx,
          input.usarEntradaDe,
          cupom,
          raffle.id,
          reservation.id,
          isFreeReservation,
        );
      }

      return reservation;
    });
  } catch (err) {
    // P2002 = violação de unique constraint do Postgres (via Prisma).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const taken = await prisma.ticket.findMany({
        where: { raffleId: raffle.id, number: { in: input.numbers } },
        select: { number: true },
      });
      throw new ReservationConflictError(taken.map((t) => t.number).sort((a, b) => a - b));
    }
    throw err;
  }
}

// Job de expiração: roda periodicamente (Inngest). Pega reservas PENDING
// expiradas, marca como EXPIRED e LIBERA os números (deleta os Tickets).
// IMPORTANTE: SetNull no FK Ticket→Reservation faria os tickets ficarem como
// "fantasmas" ocupando os números. Por isso aqui deletamos os tickets explicitamente.
export async function expireReservations(now: Date = new Date()) {
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
    select: { id: true },
    take: 500, // processa em batches para não estourar memória
  });

  if (expired.length === 0) {
    return { expired: 0 };
  }

  const ids = expired.map((r) => r.id);

  await prisma.$transaction([
    prisma.ticket.deleteMany({ where: { reservationId: { in: ids } } }),
    prisma.reservation.updateMany({
      where: { id: { in: ids } },
      data: { status: "EXPIRED" },
    }),
  ]);

  for (const id of ids) await liberarEntradaGratis(id);

  return { expired: expired.length };
}
