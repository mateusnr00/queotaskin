import { beforeEach, describe, expect, it, vi } from "vitest";

const reservationCount = vi.fn();
const reservationAggregate = vi.fn();
const reservationGroupBy = vi.fn();
const reservationFindMany = vi.fn();
const visitaDiariaAggregate = vi.fn();
const raffleFindMany = vi.fn();
const ticketCount = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    reservation: {
      count: (a: unknown) => reservationCount(a),
      aggregate: (a: unknown) => reservationAggregate(a),
      groupBy: (a: unknown) => reservationGroupBy(a),
      findMany: (a: unknown) => reservationFindMany(a),
    },
    visitaDiaria: { aggregate: (a: unknown) => visitaDiariaAggregate(a) },
    raffle: { findMany: (a: unknown) => raffleFindMany(a) },
    ticket: { count: (a: unknown) => ticketCount(a) },
  },
}));

const {
  serieDeVendas,
  funilDeConversao,
  faturamentoPorCanal,
  reservasEmRisco,
  progressoDasCampanhas,
  totaisComparativo,
  metodoDePagamento,
} = await import("./estatisticas");

const TENANT = "t1";
const FROM = new Date("2026-08-01T00:00:00Z");
const TO = new Date("2026-08-20T00:00:00Z");

beforeEach(() => {
  reservationCount.mockReset();
  reservationAggregate.mockReset();
  reservationGroupBy.mockReset();
  reservationFindMany.mockReset();
  visitaDiariaAggregate.mockReset();
  raffleFindMany.mockReset();
  ticketCount.mockReset();
});

describe("funilDeConversao", () => {
  it("calcula as três taxas do funil", async () => {
    visitaDiariaAggregate.mockResolvedValue({ _sum: { visitantes: 100 } });
    reservationCount.mockImplementation((a: { where: { status?: string } }) =>
      Promise.resolve(a.where.status === "PAID" ? 20 : 40),
    );

    const r = await funilDeConversao({ tenantId: TENANT, from: FROM, to: TO });

    expect(r).toEqual({
      visitantes: 100,
      reservas: 40,
      pagas: 20,
      taxaReservaPct: 40,
      taxaPagamentoPct: 50,
      taxaGeralPct: 20,
    });
  });

  it("sem visitantes não divide por zero: taxas viram null", async () => {
    visitaDiariaAggregate.mockResolvedValue({ _sum: { visitantes: 0 } });
    reservationCount.mockResolvedValue(0);

    const r = await funilDeConversao({ tenantId: TENANT, from: FROM, to: TO });

    expect(r.visitantes).toBe(0);
    expect(r.taxaReservaPct).toBeNull();
    expect(r.taxaGeralPct).toBeNull();
  });
});

describe("faturamentoPorCanal", () => {
  it("mapeia rótulos, trata nulo como Direto e ordena por faturamento", async () => {
    reservationGroupBy.mockResolvedValue([
      { utmContent: "ads", _sum: { totalAmount: 300 }, _count: { _all: 3 } },
      { utmContent: null, _sum: { totalAmount: 500 }, _count: { _all: 2 } },
      { utmContent: "xyz", _sum: { totalAmount: 100 }, _count: { _all: 1 } },
    ]);

    const r = await faturamentoPorCanal({ tenantId: TENANT, from: FROM, to: TO });

    expect(r.map((c) => [c.rotulo, c.faturamento])).toEqual([
      ["Direto", 500],
      ["Anúncio", 300],
      ["xyz", 100], // canal desconhecido cai no próprio id, não some
    ]);
  });
});

describe("reservasEmRisco", () => {
  it("soma pendentes e calcula a taxa de expiração da janela", async () => {
    reservationAggregate.mockResolvedValue({
      _sum: { totalAmount: 250 },
      _count: { _all: 5 },
    });
    reservationCount.mockImplementation((a: { where: { status?: string } }) =>
      Promise.resolve(a.where.status === "EXPIRED" ? 3 : 9),
    );

    const r = await reservasEmRisco({ tenantId: TENANT, now: TO });

    expect(r.pendentes).toBe(5);
    expect(r.valorPendente).toBe(250);
    expect(r.expiradas).toBe(3);
    expect(r.pagasNaJanela).toBe(9);
    expect(r.taxaExpiracaoPct).toBe(25); // 3 / (3+9)
  });

  it("janela sem movimento: taxa null em vez de 0/0", async () => {
    reservationAggregate.mockResolvedValue({
      _sum: { totalAmount: null },
      _count: { _all: 0 },
    });
    reservationCount.mockResolvedValue(0);

    const r = await reservasEmRisco({ tenantId: TENANT, now: TO });

    expect(r.valorPendente).toBe(0);
    expect(r.taxaExpiracaoPct).toBeNull();
  });
});

describe("progressoDasCampanhas", () => {
  it("calcula o % vendido por sorteio e ordena do mais cheio", async () => {
    raffleFindMany.mockResolvedValue([
      { id: "r1", title: "A", totalNumbers: 100 },
      { id: "r2", title: "B", totalNumbers: 50 },
    ]);
    ticketCount.mockImplementation((a: { where: { raffleId: string } }) =>
      Promise.resolve(a.where.raffleId === "r1" ? 40 : 50),
    );

    const r = await progressoDasCampanhas(TENANT);

    expect(r.map((c) => [c.id, c.pct])).toEqual([
      ["r2", 100],
      ["r1", 40],
    ]);
  });

  it("total zero não divide por zero", async () => {
    raffleFindMany.mockResolvedValue([
      { id: "r1", title: "A", totalNumbers: 0 },
    ]);
    ticketCount.mockResolvedValue(0);

    const r = await progressoDasCampanhas(TENANT);

    expect(r[0]!.pct).toBe(0);
  });
});

describe("totaisComparativo", () => {
  it("compara o período com o anterior de mesmo tamanho", async () => {
    // 1ª chamada = período atual, 2ª = anterior (Promise.all preserva ordem).
    reservationFindMany
      .mockResolvedValueOnce([
        { totalAmount: 100, _count: { tickets: 2 } },
        { totalAmount: 50, _count: { tickets: 1 } },
      ])
      .mockResolvedValueOnce([{ totalAmount: 100, _count: { tickets: 1 } }]);

    const r = await totaisComparativo({ tenantId: TENANT, from: FROM, to: TO });

    expect(r.atual).toEqual({
      faturamento: 150,
      reservas: 2,
      titulos: 3,
      ticketMedio: 75,
    });
    expect(r.anterior.faturamento).toBe(100);
    expect(r.variacao.faturamento).toBe(50); // (150-100)/100
    expect(r.variacao.reservas).toBe(100); // (2-1)/1
  });
});

describe("metodoDePagamento", () => {
  it("agrupa por método e ordena por faturamento", async () => {
    reservationFindMany.mockResolvedValue([
      { totalAmount: 100, payment: { method: "PIX" } },
      { totalAmount: 50, payment: { method: "PIX" } },
      { totalAmount: 30, payment: { method: "CREDIT_CARD" } },
      { totalAmount: 20, payment: null }, // sem pagamento não conta
    ]);

    const r = await metodoDePagamento({ tenantId: TENANT, from: FROM, to: TO });

    expect(r).toEqual([
      { metodo: "PIX", rotulo: "Pix", faturamento: 150, compras: 2 },
      { metodo: "CREDIT_CARD", rotulo: "Cartão", faturamento: 30, compras: 1 },
    ]);
  });
});

describe("serieDeVendas", () => {
  it("agrupa por dia em períodos curtos e soma faturamento/títulos", async () => {
    reservationFindMany.mockResolvedValue([
      {
        paidAt: new Date("2026-08-02T10:00:00Z"),
        totalAmount: 100,
        _count: { tickets: 2 },
      },
      {
        paidAt: new Date("2026-08-02T18:00:00Z"),
        totalAmount: 50,
        _count: { tickets: 1 },
      },
      {
        paidAt: new Date("2026-08-05T09:00:00Z"),
        totalAmount: 70,
        _count: { tickets: 3 },
      },
    ]);

    const r = await serieDeVendas({ tenantId: TENANT, from: FROM, to: TO });

    expect(r.granularidade).toBe("dia");
    expect(r.pontos).toHaveLength(2);
    expect(r.pontos[0]).toMatchObject({
      chave: "2026-08-02",
      faturamento: 150,
      reservas: 2,
      titulos: 3,
    });
    expect(r.pontos[1]).toMatchObject({
      chave: "2026-08-05",
      faturamento: 70,
      titulos: 3,
    });
  });
});
