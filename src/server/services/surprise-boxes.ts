// Distribuição automática de Caixas Surpresas após pagamento aprovado.
//
// Chamado pelo webhook (SyncPay/CodePay) e pelo markReservationPaidAction
// quando uma reservation vai pra PAID. Idempotente: se já existem
// SurpriseBox pra essa reserva, não cria duplicatas (UNOPENED count vs.
// expectativa do combo).
//
// Lógica:
// 1. Conta quantos tickets PAID/AWARDED a reserva tem.
// 2. Carrega os combos visíveis da rifa.
// 3. Calcula quantas caixas o comprador ganha:
//    - Acumulativo: soma todos os combos com threshold ≤ tickets.
//    - Não acumulativo: pega só o combo com maior threshold ≤ tickets.
// 4. Cria N SurpriseBox e chama o motor de alocação, no MESMO cadeado, para
//    decidir o destino de cada uma. Ver services/alocacao.ts.
//
// O SORTEIO MUDOU DE MOMENTO, e isso é o que faz o painel enxergar.
//
// Antes ele acontecia no instante da abertura, e uma caixa fechada não dizia
// nada: quem administra só descobria que alguém tinha ganhado depois que a
// pessoa clicasse, e um prêmio já com dono ficava invisível para quem precisa
// entregar. Podia levar dias, ou nunca. Agora a caixa nasce com o resultado
// dentro, e abrir é só revelar o que já estava lá.
//
// O resultado NÃO viaja para o navegador antes da abertura: quem monta a tela
// do comprovante manda o prêmio só das caixas já abertas, senão bastaria abrir
// o inspetor para saber qual caixa vale a pena.

import { prisma } from "@/lib/db";
import { alocarNaTransacao } from "@/server/services/alocacao";

export async function autoGenerateSurpriseBoxesForReservation(
  reservationId: string,
): Promise<number> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      raffleId: true,
      raffle: {
        select: {
          surpriseBoxEnabled: true,
          surpriseBoxCombosAccumulative: true,
        },
      },
      _count: {
        select: {
          tickets: { where: { status: { in: ["PAID", "AWARDED"] } } },
        },
      },
    },
  });

  if (!reservation || !reservation.raffle.surpriseBoxEnabled) return 0;
  const ticketCount = reservation._count.tickets;
  if (ticketCount === 0) return 0;

  const combos = await prisma.surpriseBoxCombo.findMany({
    where: { raffleId: reservation.raffleId },
    orderBy: { threshold: "asc" },
    select: { threshold: true, boxCount: true },
  });
  if (combos.length === 0) return 0;

  const eligible = combos.filter((c) => ticketCount >= c.threshold);
  if (eligible.length === 0) return 0;

  const expected = reservation.raffle.surpriseBoxCombosAccumulative
    ? eligible.reduce((sum, c) => sum + c.boxCount, 0)
    : Math.max(...eligible.map((c) => c.boxCount));

  // Idempotência sob concorrência: dois webhooks APPROVED (ou dois polls
  // com force:true) para a mesma reserva podem ler existing=0 ao mesmo tempo
  // e ambos criar o combo inteiro, dobrando os prêmios sem pagamento a mais.
  // Advisory lock por reserva serializa o par count→createMany, o mesmo
  // padrão do crédito de XP (xp.ts). A transação garante o lock por toda a
  // janela; ele é liberado ao fim dela.
  const raffleId = reservation.raffleId;
  // CRIAR E ALOCAR SÃO A MESMA OPERAÇÃO, dentro do mesmo cadeado.
  //
  // Antes o cadeado cobria só a criação, e o sorteio vinha depois, solto. O
  // webhook e a reconsulta de status chegam juntos o tempo todo: um criava as
  // unidades e o outro, encontrando-as criadas, seguia direto para o sorteio,
  // e os dois podiam sortear a mesma compra. Agora quem chega depois espera,
  // encontra tudo ALOCADA e sai sem fazer nada.
  return prisma.$transaction(
    async (tx) => {
      // Forma de dois argumentos (int,int), igual ao lock de XP em xp.ts: casa
      // com a sobrecarga sem cast. O primeiro argumento é um namespace fixo
      // pra não colidir com locks de outras features.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('alocacao'), hashtext(${reservationId}))
      `;

      const existing = await tx.surpriseBox.count({ where: { reservationId } });
      const toCreate = expected - existing;
      if (toCreate > 0) {
        await tx.surpriseBox.createMany({
          data: Array.from({ length: toCreate }, () => ({
            raffleId,
            reservationId,
          })),
        });
      }

      // Sempre, e não só quando criou: uma execução interrompida antes deixa
      // unidades PENDENTE, e é esta chamada que as termina na tentativa
      // seguinte, sem tocar no que já foi decidido.
      await alocarNaTransacao(tx, reservationId, "CAIXA");
      return Math.max(0, toCreate);
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
}
