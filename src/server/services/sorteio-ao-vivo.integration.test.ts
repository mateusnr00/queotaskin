// Teste de integração do motor do sorteio, contra um Postgres real.
//
// O que este arquivo testa não dá para testar sem banco. A garantia central do
// recurso é "o mesmo sorteio nunca acontece duas vezes", e ela não está em
// nenhuma linha de JavaScript: está no UPDATE com guarda de status e na chave
// única do Postgres. Um teste com banco falso passaria feliz e não provaria
// nada, porque o que decide a corrida é o banco.
//
// Pulado quando não há DATABASE_URL apontando para um Postgres local, pela
// mesma razão dos outros testes de integração daqui: ele cria campanha,
// bilhetes e sorteios de verdade.

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  agendarSorteiosPendentes,
  avancarSorteio,
  carregarEstadoPublico,
  estadoPublico,
  processarSorteios,
  SELECAO_DA_CAMPANHA,
} from "./sorteio-ao-vivo";
import { marcosDoSorteio, TEMPOS_PADRAO } from "@/lib/sorteio-ao-vivo";

function isLocalDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  if (process.env.XP_INTEGRATION_ALLOW_REMOTE === "1") return true;
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

const suite = isLocalDatabase() ? describe : describe.skip;

const criados: string[] = [];
const usuariosCriados: string[] = [];

suite("motor do sorteio ao vivo (integração)", () => {
  let tenantId: string;
  let userId: string;

  async function novaCampanha(opcoes: {
    totalNumbers: number;
    vendidos: number;
    drawDate?: Date | null;
    autoClose?: boolean;
  }): Promise<string> {
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) throw new Error("Banco sem Tenant: rode o seed antes.");
    tenantId = tenant.id;
    // Usuário próprio, e não o primeiro do banco: outras suítes contam XP e
    // reservas por usuário, e emprestar o deles faria um teste sujar o outro.
    if (!userId) {
      const user = await prisma.user.create({
        data: {
          name: "Participante do teste de sorteio",
          cpf: `9${Date.now().toString().slice(-10)}`,
        },
        select: { id: true },
      });
      userId = user.id;
      usuariosCriados.push(user.id);
    }

    const rifa = await prisma.raffle.create({
      data: {
        tenantId,
        createdById: userId,
        slug: `sorteio-teste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: "Campanha de teste do sorteio ao vivo",
        status: "ACTIVE",
        totalNumbers: opcoes.totalNumbers,
        pricePerNumber: 1,
        drawDate: opcoes.drawDate ?? null,
        autoCloseOnDraw: opcoes.autoClose ?? true,
      },
      select: { id: true },
    });
    criados.push(rifa.id);

    if (opcoes.vendidos > 0) {
      const reserva = await prisma.reservation.create({
        data: {
          raffleId: rifa.id,
          userId,
          participantName: "Fulano de Tal Silva",
          totalAmount: opcoes.vendidos,
          status: "PAID",
          expiresAt: new Date(Date.now() + 3_600_000),
          paidAt: new Date(),
        },
        select: { id: true },
      });
      await prisma.ticket.createMany({
        data: Array.from({ length: opcoes.vendidos }, (_, i) => ({
          raffleId: rifa.id,
          number: i + 1,
          status: "PAID" as const,
          reservationId: reserva.id,
          paidAt: new Date(),
        })),
      });
    }
    return rifa.id;
  }

  beforeEach(() => {
    // Cada teste tem a sua campanha; nada é compartilhado entre eles.
  });

  afterAll(async () => {
    // Draw cai por cascade junto da campanha.
    if (criados.length > 0) {
      await prisma.raffle.deleteMany({ where: { id: { in: criados } } });
    }
    if (usuariosCriados.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: usuariosCriados } } });
    }
  });

  it("agenda o sorteio quando a campanha esgota, e congela a campanha", async () => {
    const raffleId = await novaCampanha({ totalNumbers: 5, vendidos: 5 });

    const { agendados } = await agendarSorteiosPendentes(new Date());
    expect(agendados).toBeGreaterThanOrEqual(1);

    const draw = await prisma.draw.findUnique({ where: { raffleId } });
    expect(draw).not.toBeNull();
    expect(draw!.status).toBe("WAITING_DRAW");
    expect(draw!.publicId).toMatch(/^DRW-\d{8}-[0-9A-HJ-NP-Z]{4}$/);
    expect(draw!.winningNumber).toBeNull();

    // A campanha fechou junto, na mesma transação. É este FINISHED que a
    // criação de reserva já recusa, e é assim que o universo congela sem
    // nenhuma trava nova no caminho da compra.
    const rifa = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { status: true },
    });
    expect(rifa!.status).toBe("FINISHED");
  });

  it("não agenda duas vezes a mesma campanha", async () => {
    const raffleId = await novaCampanha({ totalNumbers: 4, vendidos: 4 });
    await agendarSorteiosPendentes(new Date());
    await agendarSorteiosPendentes(new Date());
    await processarSorteios(new Date());

    expect(await prisma.draw.count({ where: { raffleId } })).toBe(1);
  });

  it("dois workers no mesmo instante criam um sorteio só", async () => {
    const raffleId = await novaCampanha({ totalNumbers: 6, vendidos: 6 });

    // O cenário real: duas invocações da função de cron acordam juntas, ou o
    // cron dispara enquanto alguém abre a página. As duas leem "esta campanha
    // esgotou e não tem sorteio" antes de qualquer uma escrever.
    const agora = new Date();
    await Promise.all([
      agendarSorteiosPendentes(agora),
      agendarSorteiosPendentes(agora),
      agendarSorteiosPendentes(agora),
    ]);

    expect(await prisma.draw.count({ where: { raffleId } })).toBe(1);
  });

  it("não agenda campanha sem nenhuma venda", async () => {
    const raffleId = await novaCampanha({
      totalNumbers: 10,
      vendidos: 0,
      drawDate: new Date(Date.now() - 3_600_000),
    });
    await agendarSorteiosPendentes(new Date());

    expect(await prisma.draw.findUnique({ where: { raffleId } })).toBeNull();
    // E a campanha continua aberta: não vender não é motivo para fechar.
    const rifa = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { status: true },
    });
    expect(rifa!.status).toBe("ACTIVE");
  });

  it("agenda pela data marcada, contando a partir dela e não de agora", async () => {
    const drawDate = new Date(Date.now() - 120_000);
    const raffleId = await novaCampanha({
      totalNumbers: 100,
      vendidos: 3,
      drawDate,
    });
    await agendarSorteiosPendentes(new Date());

    const draw = await prisma.draw.findUnique({ where: { raffleId } });
    expect(draw).not.toBeNull();
    // Dois minutos de atraso do worker não empurram o cronograma: ele sai da
    // hora anunciada, e a espera de dez minutos vira oito.
    expect(draw!.raffleEndedAt.getTime()).toBe(drawDate.getTime());
  });

  it("o número é escolhido uma vez só, mesmo com dez chamadas simultâneas", async () => {
    const raffleId = await novaCampanha({ totalNumbers: 8, vendidos: 8 });
    await agendarSorteiosPendentes(new Date());
    const draw = await prisma.draw.findUniqueOrThrow({ where: { raffleId } });

    // Dez abas pedindo o estado no segundo em que a contagem zera. Todas
    // chamam avancarSorteio, todas veem "passou da hora e não tem número".
    const depoisDaHora = new Date(draw.drawStartsAt.getTime() + 1000);
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => avancarSorteio(draw, depoisDaHora)),
    );

    const numeros = new Set(
      resultados.map((r) => r.winningNumber).filter((n) => n != null),
    );
    expect(numeros.size).toBe(1);

    const final = await prisma.draw.findUniqueOrThrow({ where: { raffleId } });
    expect(final.winningNumber).not.toBeNull();
    expect(final.drawExecutedAt).not.toBeNull();
    expect(final.eligibleTicketCount).toBe(8);
    expect(final.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(final.winnerTicketId).not.toBeNull();
    // O nome vai congelado e encurtado, no formato das listas públicas.
    // "de" é partícula, então o nome curto para em "Fulano". É a mesma regra
    // das outras listas públicas do site.
    expect(final.winnerName).toBe("Fulano");
  });

  it("o número sorteado é sempre um bilhete que existe e foi pago", async () => {
    // Com data marcada no passado: sete de trinta não esgota, e sem a data
    // esta campanha não seria candidata nenhuma, que é o comportamento certo.
    const raffleId = await novaCampanha({
      totalNumbers: 30,
      vendidos: 7,
      drawDate: new Date(Date.now() - 60_000),
    });
    await agendarSorteiosPendentes(new Date());
    const draw = await prisma.draw.findUniqueOrThrow({ where: { raffleId } });
    const final = await avancarSorteio(
      draw,
      new Date(draw.drawStartsAt.getTime() + 1000),
    );

    // Sete vendidos de trinta: sortear no intervalo cheio cairia em número sem
    // dono em três de cada quatro vezes.
    expect(final.winningNumber).toBeGreaterThanOrEqual(1);
    expect(final.winningNumber).toBeLessThanOrEqual(7);
    const bilhete = await prisma.ticket.findFirst({
      where: { raffleId, number: final.winningNumber! },
      select: { status: true, id: true },
    });
    expect(bilhete!.status).toBe("PAID");
    expect(final.winnerTicketId).toBe(bilhete!.id);
  });

  it("uma segunda passada não muda o resultado já gravado", async () => {
    const raffleId = await novaCampanha({ totalNumbers: 5, vendidos: 5 });
    await agendarSorteiosPendentes(new Date());
    const draw = await prisma.draw.findUniqueOrThrow({ where: { raffleId } });
    const depois = new Date(draw.drawStartsAt.getTime() + 1000);

    const primeiro = await avancarSorteio(draw, depois);
    // Roda o worker inteiro de novo, e mais uma vez a partir da linha antiga.
    await processarSorteios(new Date(depois.getTime() + 2000));
    const segundo = await avancarSorteio(draw, new Date(depois.getTime() + 5000));

    expect(segundo.winningNumber).toBe(primeiro.winningNumber);
    expect(segundo.drawExecutedAt?.getTime()).toBe(
      primeiro.drawExecutedAt?.getTime(),
    );
  });

  it("leva o sorteio até o fim quando o sistema volta com a hora passada", async () => {
    // A recuperação: ninguém abriu a página, o servidor ficou fora do ar, e o
    // worker acorda com a transmissão inteira no passado.
    const raffleId = await novaCampanha({ totalNumbers: 3, vendidos: 3 });
    await agendarSorteiosPendentes(new Date());
    const draw = await prisma.draw.findUniqueOrThrow({ where: { raffleId } });

    const muitoDepois = new Date(draw.winnerRevealAt.getTime() + 3_600_000);
    const final = await avancarSorteio(draw, muitoDepois);

    expect(final.status).toBe("FINISHED");
    expect(final.winningNumber).not.toBeNull();
    expect(final.finishedAt).not.toBeNull();
    // O resultado também foi para a campanha, que é onde o card de ganhador
    // da página pública lê.
    const rifa = await prisma.raffle.findUniqueOrThrow({
      where: { id: raffleId },
      select: { winnerTicketNumber: true, winnerDrawnAt: true },
    });
    expect(rifa.winnerTicketNumber).toBe(final.winningNumber);
    expect(rifa.winnerDrawnAt).not.toBeNull();
  });

  it("o estado público não entrega o número antes da hora", async () => {
    const raffleId = await novaCampanha({ totalNumbers: 4, vendidos: 4 });
    await agendarSorteiosPendentes(new Date());
    const draw = await prisma.draw.findUniqueOrThrow({ where: { raffleId } });

    // Sorteia, para existir número gravado. O teste é justamente que ele NÃO
    // aparece no payload antes da hora, mesmo já estando no banco.
    const executado = await avancarSorteio(
      draw,
      new Date(draw.drawStartsAt.getTime() + 500),
    );
    expect(executado.winningNumber).not.toBeNull();

    const rifa = await prisma.raffle.findUniqueOrThrow({
      where: { id: raffleId },
      select: SELECAO_DA_CAMPANHA,
    });

    const durante = estadoPublico(
      executado,
      rifa,
      new Date(draw.revealAt.getTime() - 1000),
    );
    expect(durante.status).toBe("DRAWING");
    expect(durante.resultado).toBeNull();
    // E nenhum campo do resultado viaja escondido no payload esperando o
    // cliente se comportar: as chaves não existem.
    expect(JSON.stringify(durante)).not.toMatch(
      /winningNumber|winnerName|winnerTicketId|winnerUserId/,
    );
    expect(durante.snapshotHash).toBeNull();
    expect(durante.drawExecutedAt).toBeNull();

    const naRevelacao = estadoPublico(executado, rifa, draw.revealAt);
    expect(naRevelacao.resultado?.numero).toBe(executado.winningNumber);
    // O número saiu, o nome ainda não: são quatro segundos de diferença, e é
    // o que a animação usa para "buscando o dono da cota".
    expect(naRevelacao.resultado?.ganhador).toBeNull();

    const noFim = estadoPublico(executado, rifa, draw.winnerRevealAt);
    expect(noFim.resultado?.ganhador).toBe("Fulano");
    expect(noFim.snapshotHash).toBe(executado.snapshotHash);
  });

  it("o estado público nunca carrega dado sensível do ganhador", async () => {
    const raffleId = await novaCampanha({ totalNumbers: 2, vendidos: 2 });
    await prisma.reservation.updateMany({
      where: { raffleId },
      data: {
        participantCpf: "39053344705",
        participantPhone: "11999998888",
        participantEmail: "vencedor@exemplo.com",
      },
    });
    await agendarSorteiosPendentes(new Date());
    const draw = await prisma.draw.findUniqueOrThrow({ where: { raffleId } });
    const estado = await carregarEstadoPublico(
      draw.publicId,
      new Date(draw.winnerRevealAt.getTime() + 1000),
    );

    const json = JSON.stringify(estado);
    expect(json).not.toContain("39053344705");
    expect(json).not.toContain("11999998888");
    expect(json).not.toContain("vencedor@exemplo.com");
    // Nem o nome completo: só o curto.
    expect(json).not.toContain("Fulano de Tal Silva");
    expect(estado!.resultado?.ganhador).toBe("Fulano");
  });

  it("código público inexistente devolve nulo em vez de explodir", async () => {
    expect(await carregarEstadoPublico("DRW-20260101-ZZZZ")).toBeNull();
  });

  it("o cronograma gravado bate com o calculado", async () => {
    const raffleId = await novaCampanha({ totalNumbers: 2, vendidos: 2 });
    const agora = new Date();
    await agendarSorteiosPendentes(agora);
    const draw = await prisma.draw.findUniqueOrThrow({ where: { raffleId } });

    const esperado = marcosDoSorteio(draw.raffleEndedAt, TEMPOS_PADRAO);
    expect(draw.drawScheduledAt.getTime()).toBe(
      esperado.drawScheduledAt.getTime(),
    );
    expect(draw.drawStartsAt.getTime()).toBe(esperado.drawStartsAt.getTime());
    expect(draw.revealAt.getTime()).toBe(esperado.revealAt.getTime());
    expect(draw.winnerRevealAt.getTime()).toBe(
      esperado.winnerRevealAt.getTime(),
    );
  });
});
