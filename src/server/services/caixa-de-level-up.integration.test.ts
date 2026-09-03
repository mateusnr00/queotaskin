// A Caixa de Level Up contra um Postgres real.
//
// A lógica pura (sorteio, degraus, multiplicação) está em
// src/lib/xp/caixa-de-level-up.test.ts. Aqui fica o que só aparece com banco:
// a idempotência do índice único, a corrida de duas confirmações pelo mesmo
// boost, e o encadeamento level up -> caixa -> boost -> compra -> level up.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { levelFromXp, XP_POR_NIVEL } from "@/lib/rank";
import { awardXpForReservation } from "@/server/services/xp";
import {
  abrirCaixa,
  recompensasDoUsuario,
} from "@/server/services/caixa-de-level-up";

function isLocalDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  if (process.env.XP_INTEGRATION_ALLOW_REMOTE === "1") return true;
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

const suite = isLocalDatabase() ? describe : describe.skip;

suite("Caixa de Level Up (integração)", () => {
  let tenantId: string;
  let raffleId: string;
  let userId: string;
  const usuarios: string[] = [];

  beforeAll(async () => {
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) throw new Error("Rode `npm run db:seed` antes deste teste.");
    tenantId = tenant.id;

    const raffle = await prisma.raffle.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!raffle) throw new Error("Nenhuma campanha no tenant de teste.");
    raffleId = raffle.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } }).catch(() => {});
  });

  async function ligarRecurso(quando = new Date(Date.now() - 60_000)) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        rankEnabled: true,
        xpPerBrl: 10,
        levelUpBoxesEnabled: true,
        levelUpBoxesEnabledAt: quando,
        levelUpBoostMinutes: 15,
      },
    });
  }

  /** Um contador local mais o relógio: telefone é único no banco, e sorteá-lo
   *  colidia com o de outra suíte rodando em paralelo. */
  let sequencia = 0;

  async function novoUsuario(): Promise<string> {
    sequencia += 1;
    const marca = `${Date.now()}${sequencia}`.slice(-9);
    const u = await prisma.user.create({
      data: {
        name: "Teste Caixa",
        phone: `55${marca}`,
        role: "PARTICIPANT",
      },
      select: { id: true },
    });
    usuarios.push(u.id);
    return u.id;
  }

  async function compraPaga(reais: number, dono = userId): Promise<string> {
    const r = await prisma.reservation.create({
      data: {
        raffleId,
        userId: dono,
        participantName: "Teste Caixa",
        totalAmount: reais,
        status: "PAID",
        paidAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });
    return r.id;
  }

  /** Uma reserva que NÃO está paga, para os testes de PIX pendente. */
  async function compraPendente(reais: number): Promise<string> {
    const r = await prisma.reservation.create({
      data: {
        raffleId,
        userId,
        participantName: "Teste Caixa",
        totalAmount: reais,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });
    return r.id;
  }

  async function caixas() {
    return prisma.levelUpBox.findMany({
      where: { userId, tenantId },
      orderBy: { sourceLevel: "asc" },
      select: {
        id: true,
        sourceLevel: true,
        status: true,
        multiplier: true,
        rarity: true,
        openedAt: true,
        expiresAt: true,
        consumedAt: true,
        consumedByReservationId: true,
        baseXp: true,
        bonusXp: true,
        finalXp: true,
      },
    });
  }

  beforeEach(async () => {
    await ligarRecurso();
    userId = await novoUsuario();
  });

  // ---------------------------------------------------------------- 1 a 4
  it("1. subir um nível dá uma caixa, do nível conquistado", async () => {
    // R$ 100 leva do nível 0 ao 1 (o degrau é 1.000 XP).
    await awardXpForReservation(await compraPaga(100));
    const lista = await caixas();
    expect(lista).toHaveLength(1);
    expect(lista[0]!.sourceLevel).toBe(1);
    expect(lista[0]!.status).toBe("FECHADA");
  });

  it("2. subir vários níveis dá uma caixa por degrau", async () => {
    // R$ 800 rende bem mais de 8.000 XP e atravessa vários degraus.
    await awardXpForReservation(await compraPaga(800));
    const lista = await caixas();
    const nivelFinal = levelFromXp(
      (await prisma.userProgress.findFirstOrThrow({ where: { userId, tenantId } })).xp,
    );
    expect(nivelFinal).toBeGreaterThan(1);
    expect(lista.map((c) => c.sourceLevel)).toEqual(
      Array.from({ length: nivelFinal }, (_, i) => i + 1),
    );
  });

  it("3 e 4. reprocessar a mesma compra não duplica caixa nem XP", async () => {
    // É o webhook reentregue: o índice único e a checagem do extrato seguram.
    const id = await compraPaga(100);
    await awardXpForReservation(id);
    const xpDepoisDaPrimeira = (
      await prisma.userProgress.findFirstOrThrow({ where: { userId, tenantId } })
    ).xp;

    await awardXpForReservation(id);
    await awardXpForReservation(id);

    expect(await caixas()).toHaveLength(1);
    expect(
      (await prisma.userProgress.findFirstOrThrow({ where: { userId, tenantId } })).xp,
    ).toBe(xpDepoisDaPrimeira);
  });

  it("4b. confirmações simultâneas da mesma compra não duplicam caixa", async () => {
    const id = await compraPaga(100);
    await Promise.all(Array.from({ length: 5 }, () => awardXpForReservation(id)));
    expect(await caixas()).toHaveLength(1);
  });

  // ---------------------------------------------------------------- 5 a 9
  it("5. caixa fechada não tem relógio correndo", async () => {
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    expect(caixa!.openedAt).toBeNull();
    expect(caixa!.expiresAt).toBeNull();
    expect(caixa!.multiplier).toBeNull();
  });

  it("6, 8 e 9. abrir sorteia uma vez, cria o prazo, e reabrir devolve o mesmo", async () => {
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();

    const r1 = await abrirCaixa({ boxId: caixa!.id, userId, tenantId });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.multiplicador).toBeGreaterThan(1);
    expect(new Date(r1.expiraEm).getTime()).toBeGreaterThan(Date.now());

    // Recarregar a página não sorteia de novo.
    const r2 = await abrirCaixa({ boxId: caixa!.id, userId, tenantId });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.multiplicador).toBe(r1.multiplicador);
    expect(r2.raridade).toBe(r1.raridade);
    expect(r2.expiraEm).toBe(r1.expiraEm);
  });

  it("6b. o prazo é openedAt mais os minutos configurados", async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { levelUpBoostMinutes: 20 },
    });
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    await abrirCaixa({ boxId: caixa!.id, userId, tenantId });

    const depois = (await caixas())[0]!;
    const minutos =
      (depois.expiresAt!.getTime() - depois.openedAt!.getTime()) / 60_000;
    expect(Math.round(minutos)).toBe(20);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { levelUpBoostMinutes: 15 },
    });
  });

  // -------------------------------------------------------------- 10 a 18
  it("10, 11 e 16. boost válido multiplica o XP e é consumido na compra paga", async () => {
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    const aberta = await abrirCaixa({ boxId: caixa!.id, userId, tenantId });
    if (!aberta.ok) throw new Error("não abriu");

    const xpAntes = (
      await prisma.userProgress.findFirstOrThrow({ where: { userId, tenantId } })
    ).xp;

    const compra = await compraPaga(50);
    await awardXpForReservation(compra);

    const lancamento = await prisma.xpEntry.findFirstOrThrow({
      where: { reservationId: compra, reason: "PURCHASE" },
      select: { amount: true, metadata: true, baseXp: true },
    });
    const meta = lancamento.metadata as { levelUpBoost?: { multiplicador: number; xpAntesDoBoost: number } };
    expect(meta.levelUpBoost?.multiplicador).toBe(aberta.multiplicador);
    // O XP creditado é o de sempre multiplicado pelo boost.
    expect(lancamento.amount).toBe(
      Math.floor(meta.levelUpBoost!.xpAntesDoBoost * aberta.multiplicador),
    );
    expect(lancamento.amount).toBeGreaterThan(meta.levelUpBoost!.xpAntesDoBoost);

    const usada = await prisma.levelUpBox.findUniqueOrThrow({
      where: { id: caixa!.id },
      select: { status: true, consumedByReservationId: true, finalXp: true, bonusXp: true },
    });
    expect(usada.status).toBe("CONSUMIDA");
    expect(usada.consumedByReservationId).toBe(compra);
    expect(usada.finalXp).toBe(lancamento.amount);
    expect(usada.bonusXp).toBeGreaterThan(0);

    expect(
      (await prisma.userProgress.findFirstOrThrow({ where: { userId, tenantId } })).xp,
    ).toBeGreaterThan(xpAntes);
  });

  it("12. a segunda compra não recebe o mesmo boost", async () => {
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    await abrirCaixa({ boxId: caixa!.id, userId, tenantId });

    const primeira = await compraPaga(50);
    await awardXpForReservation(primeira);
    const segunda = await compraPaga(50);
    await awardXpForReservation(segunda);

    const l1 = await prisma.xpEntry.findFirstOrThrow({
      where: { reservationId: primeira },
      select: { amount: true, metadata: true },
    });
    const l2 = await prisma.xpEntry.findFirstOrThrow({
      where: { reservationId: segunda },
      select: { amount: true, metadata: true },
    });
    expect((l1.metadata as { levelUpBoost?: unknown }).levelUpBoost).toBeDefined();
    expect((l2.metadata as { levelUpBoost?: unknown }).levelUpBoost).toBeUndefined();
    expect(l2.amount).toBeLessThan(l1.amount);
  });

  it("13, 14 e 15. PIX pendente, expirado ou falho não consome o boost", async () => {
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    await abrirCaixa({ boxId: caixa!.id, userId, tenantId });

    // Reserva não paga: awardXp recusa, e o boost não é tocado.
    const pendente = await compraPendente(50);
    expect(await awardXpForReservation(pendente)).toBeNull();

    await prisma.reservation.update({
      where: { id: pendente },
      data: { status: "EXPIRED" },
    });
    expect(await awardXpForReservation(pendente)).toBeNull();

    await prisma.reservation.update({
      where: { id: pendente },
      data: { status: "CANCELLED" },
    });
    expect(await awardXpForReservation(pendente)).toBeNull();

    const depois = await prisma.levelUpBox.findUniqueOrThrow({
      where: { id: caixa!.id },
      select: { status: true, consumedAt: true },
    });
    expect(depois.status).toBe("ATIVA");
    expect(depois.consumedAt).toBeNull();
  });

  it("17 e 18. pagamento confirmado depois do prazo não pega o boost", async () => {
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    await abrirCaixa({ boxId: caixa!.id, userId, tenantId });

    // O relógio anda: o prazo passa antes da confirmação.
    await prisma.levelUpBox.update({
      where: { id: caixa!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const compra = await compraPaga(50);
    await awardXpForReservation(compra);

    const lancamento = await prisma.xpEntry.findFirstOrThrow({
      where: { reservationId: compra },
      select: { metadata: true },
    });
    expect((lancamento.metadata as { levelUpBoost?: unknown }).levelUpBoost).toBeUndefined();

    const depois = await prisma.levelUpBox.findUniqueOrThrow({
      where: { id: caixa!.id },
      select: { status: true, consumedAt: true },
    });
    expect(depois.consumedAt).toBeNull();
    expect(depois.status).toBe("ATIVA");
  });

  // -------------------------------------------------------------- 19 a 23
  it("19. não deixa abrir uma segunda caixa com boost ativo", async () => {
    await awardXpForReservation(await compraPaga(800));
    const lista = await caixas();
    expect(lista.length).toBeGreaterThan(1);

    expect((await abrirCaixa({ boxId: lista[0]!.id, userId, tenantId })).ok).toBe(true);

    const segunda = await abrirCaixa({ boxId: lista[1]!.id, userId, tenantId });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.erro).toMatch(/já possui um Boost de XP ativo/i);
  });

  it("20. várias caixas fechadas convivem, e nenhuma expira fechada", async () => {
    await awardXpForReservation(await compraPaga(800));
    const r = await recompensasDoUsuario({ userId, tenantId });
    expect(r.fechadas.length).toBeGreaterThan(1);
    expect(r.ativo).toBeNull();
  });

  it("21 e 22. o boost que causa novo level up gera as caixas dos níveis novos", async () => {
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    const aberta = await abrirCaixa({ boxId: caixa!.id, userId, tenantId });
    if (!aberta.ok) throw new Error("não abriu");

    const niveisAntes = (await caixas()).length;
    // Compra grande com boost: atravessa vários degraus de uma vez.
    await awardXpForReservation(await compraPaga(500));

    const depois = await caixas();
    expect(depois.length).toBeGreaterThan(niveisAntes);
    // As novas nascem fechadas: nenhum boost se aplica sozinho.
    const novas = depois.filter((c) => c.sourceLevel > caixa!.sourceLevel);
    expect(novas.length).toBeGreaterThan(0);
    expect(novas.every((c) => c.status === "FECHADA")).toBe(true);
  });

  it("23. duas confirmações simultâneas de compras diferentes não usam o mesmo boost", async () => {
    // O exploit: dois PIX criados com o boost ativo, pagos ao mesmo tempo.
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    await abrirCaixa({ boxId: caixa!.id, userId, tenantId });

    const a = await compraPaga(50);
    const b = await compraPaga(50);
    await Promise.all([awardXpForReservation(a), awardXpForReservation(b)]);

    const lancamentos = await prisma.xpEntry.findMany({
      where: { reservationId: { in: [a, b] } },
      select: { metadata: true },
    });
    const comBoost = lancamentos.filter(
      (l) => (l.metadata as { levelUpBoost?: unknown }).levelUpBoost,
    );
    // Exatamente UMA das duas leva o boost.
    expect(comBoost).toHaveLength(1);

    const usada = await prisma.levelUpBox.findUniqueOrThrow({
      where: { id: caixa!.id },
      select: { status: true, consumedByReservationId: true },
    });
    expect(usada.status).toBe("CONSUMIDA");
    expect([a, b]).toContain(usada.consumedByReservationId);
  });

  // -------------------------------------------------------------- 25 a 28
  it("25. não dá para abrir a caixa de outra pessoa", async () => {
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    const intruso = await novoUsuario();

    const r = await abrirCaixa({ boxId: caixa!.id, userId: intruso, tenantId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/não encontrada/i);

    // E a caixa continua fechada, esperando o dono.
    expect((await caixas())[0]!.status).toBe("FECHADA");
  });

  it("26. o multiplicador vem do servidor: o que a tela mandaria é ignorado", async () => {
    // A action recebe só o id da caixa. Não existe caminho para o navegador
    // informar multiplicador, raridade ou prazo, e por isso a assinatura de
    // abrirCaixa não tem onde encaixar esses valores.
    await awardXpForReservation(await compraPaga(100));
    const [caixa] = await caixas();
    const r = await abrirCaixa({
      boxId: caixa!.id,
      userId,
      tenantId,
      // @ts-expect-error o tipo não aceita: é a garantia em tempo de compilação.
      multiplicador: 99,
      raridade: "ULTRA_RARO",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.multiplicador).toBeLessThanOrEqual(3.5);
    expect(r.multiplicador).not.toBe(99);
  });

  it("27. recurso desligado não concede caixa nova", async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { levelUpBoxesEnabled: false },
    });
    await awardXpForReservation(await compraPaga(800));
    expect(await caixas()).toHaveLength(0);
    await ligarRecurso();
  });

  it("28. quem já tinha nível não ganha caixa retroativa", async () => {
    // O usuário chega ao nível 3 com o recurso DESLIGADO.
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { levelUpBoxesEnabled: false },
    });
    await awardXpForReservation(await compraPaga(600));
    const nivelAntes = levelFromXp(
      (await prisma.userProgress.findFirstOrThrow({ where: { userId, tenantId } })).xp,
    );
    expect(nivelAntes).toBeGreaterThanOrEqual(2);
    expect(await caixas()).toHaveLength(0);

    // Agora o recurso é ligado. A próxima compra dá caixa só dos níveis NOVOS.
    await ligarRecurso(new Date());
    await awardXpForReservation(await compraPaga(300));

    const lista = await caixas();
    expect(lista.length).toBeGreaterThan(0);
    // Nenhuma caixa de nível que ele já tinha antes da estreia.
    expect(lista.every((c) => c.sourceLevel > nivelAntes)).toBe(true);
  });

  it("a subida não pode passar do teto da tabela de níveis", async () => {
    // Guarda contra caixa de nível inexistente se alguém gastar uma fortuna.
    expect(XP_POR_NIVEL.length - 1).toBeGreaterThan(0);
    await awardXpForReservation(await compraPaga(100));
    const lista = await caixas();
    expect(lista.every((c) => c.sourceLevel <= XP_POR_NIVEL.length - 1)).toBe(true);
  });
});
