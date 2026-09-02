// Teste de integração do cronograma, contra um Postgres real.
//
// O que este arquivo testa não dá para testar sem banco. As garantias centrais
// do recurso não estão em nenhuma linha de JavaScript: estão no índice parcial
// único, no SELECT ... FOR UPDATE e nos UPDATEs com guarda de status. Um teste
// com banco falso passaria feliz e não provaria nada, porque quem decide a
// corrida é o Postgres.
//
// Pulado quando não há DATABASE_URL apontando para um Postgres local, pela
// mesma razão dos outros testes de integração daqui: ele cria campanha, fila e
// sorteio de verdade.

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { NA_VITRINE, visivelAoPublico } from "@/lib/vitrine";
import {
  ativarProximo,
  carregarCronograma,
  enfileirar,
  garantirCronograma,
  handleDrawFinished,
  pularItem,
  removerDaFila,
  reordenarFila,
  varrerCronogramas,
} from "./cronograma";
import { avancarSorteio } from "./sorteio-ao-vivo";

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

const campanhasCriadas: string[] = [];
const usuariosCriados: string[] = [];

suite("cronograma de sorteios (integração)", () => {
  let tenantId: string;
  let userId: string;

  async function novaCampanha(
    titulo: string,
    status: "DRAFT" | "ACTIVE" = "DRAFT",
  ): Promise<string> {
    const rifa = await prisma.raffle.create({
      data: {
        tenantId,
        createdById: userId,
        slug: `cron-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: titulo,
        status,
        totalNumbers: 10,
        pricePerNumber: 1,
        privacy: "PUBLIC",
        prizes: { create: { position: 1, description: "Skin de teste" } },
      },
      select: { id: true },
    });
    campanhasCriadas.push(rifa.id);
    return rifa.id;
  }

  /** Coloca a campanha na fila e devolve o id do item. */
  async function naFila(raffleId: string): Promise<string> {
    const r = await enfileirar({ tenantId, raffleId });
    if (!r.ok) throw new Error(r.erros.join(" "));
    return r.itemId;
  }

  async function statusDaCampanha(raffleId: string): Promise<string> {
    const r = await prisma.raffle.findUniqueOrThrow({
      where: { id: raffleId },
      select: { status: true },
    });
    return r.status;
  }

  async function statusDoItem(raffleId: string): Promise<string> {
    const i = await prisma.drawScheduleItem.findUniqueOrThrow({
      where: { raffleId },
      select: { status: true },
    });
    return i.status;
  }

  beforeEach(async () => {
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) throw new Error("Banco sem Tenant: rode o seed antes.");
    tenantId = tenant.id;

    if (!userId) {
      const user = await prisma.user.create({
        data: {
          name: "Admin do teste de cronograma",
          cpf: `8${Date.now().toString().slice(-10)}`,
        },
        select: { id: true },
      });
      userId = user.id;
      usuariosCriados.push(user.id);
    }

    // Cada caso começa com a fila limpa: os itens são do tenant do seed, e um
    // teste deixando lixo faria o seguinte ativar a campanha errada.
    const cronograma = await garantirCronograma(tenantId);
    await prisma.drawScheduleItem.deleteMany({
      where: { scheduleId: cronograma.id },
    });
    await prisma.drawSchedule.update({
      where: { id: cronograma.id },
      data: {
        automacaoAtiva: true,
        atrasoEmSegundos: 0,
        ultimoErro: null,
        ultimoErroEm: null,
      },
    });
  });

  afterAll(async () => {
    await prisma.drawScheduleItem.deleteMany({
      where: { raffleId: { in: campanhasCriadas } },
    });
    await prisma.raffle.deleteMany({ where: { id: { in: campanhasCriadas } } });
    await prisma.user.deleteMany({ where: { id: { in: usuariosCriados } } });
  });

  // -------------------------------------------------------------------------
  // A FILA ANDA
  // -------------------------------------------------------------------------

  it("o sorteio A termina e o B entra no ar", async () => {
    const a = await novaCampanha("A");
    const b = await novaCampanha("B");
    await naFila(a);
    await naFila(b);

    // Ninguém no ar ainda: as duas estão escondidas do público.
    expect(await statusDaCampanha(a)).toBe("QUEUED");
    expect(await statusDaCampanha(b)).toBe("QUEUED");

    const primeira = await ativarProximo({ tenantId, origem: "MANUAL" });
    expect(primeira.ok && primeira.raffleId).toBe(a);
    expect(await statusDaCampanha(a)).toBe("ACTIVE");

    // O ciclo de A termina.
    await prisma.raffle.update({
      where: { id: a },
      data: { status: "FINISHED" },
    });
    await handleDrawFinished(a);

    expect(await statusDoItem(a)).toBe("CONCLUIDO");
    expect(await statusDaCampanha(b)).toBe("ACTIVE");
    expect(await statusDoItem(b)).toBe("ATIVO");
  });

  it("com a automação pausada, o próximo não entra", async () => {
    const a = await novaCampanha("A");
    const b = await novaCampanha("B");
    await naFila(a);
    await naFila(b);
    await ativarProximo({ tenantId, origem: "MANUAL" });

    const cronograma = await garantirCronograma(tenantId);
    await prisma.drawSchedule.update({
      where: { id: cronograma.id },
      data: { automacaoAtiva: false },
    });

    await handleDrawFinished(a);

    // O ciclo de A fecha do mesmo jeito: pausar não é congelar o que já está
    // acontecendo, é só não publicar o próximo.
    expect(await statusDoItem(a)).toBe("CONCLUIDO");
    expect(await statusDaCampanha(b)).toBe("QUEUED");
    expect(await statusDoItem(b)).toBe("AGUARDANDO");

    // E a varredura do cron respeita a pausa também.
    await varrerCronogramas();
    expect(await statusDaCampanha(b)).toBe("QUEUED");
  });

  it("sem próximo na fila, nada quebra", async () => {
    const a = await novaCampanha("A sozinha");
    await naFila(a);
    await ativarProximo({ tenantId, origem: "MANUAL" });

    await expect(handleDrawFinished(a)).resolves.toBeUndefined();
    expect(await statusDoItem(a)).toBe("CONCLUIDO");

    const { itens } = await carregarCronograma(tenantId);
    expect(itens.filter((i) => i.status === "ATIVO")).toHaveLength(0);
  });

  it("pula o próximo e ativa o seguinte", async () => {
    const a = await novaCampanha("A");
    const b = await novaCampanha("B pulada");
    const c = await novaCampanha("C");
    await naFila(a);
    const itemB = await naFila(b);
    await naFila(c);

    await ativarProximo({ tenantId, origem: "MANUAL" });
    await pularItem({ tenantId, itemId: itemB });

    await handleDrawFinished(a);

    expect(await statusDaCampanha(b)).toBe("QUEUED");
    expect(await statusDoItem(b)).toBe("PULADO");
    expect(await statusDaCampanha(c)).toBe("ACTIVE");
  });

  it("a ordem gravada decide quem entra", async () => {
    const a = await novaCampanha("A");
    const b = await novaCampanha("B");
    const c = await novaCampanha("C");
    await naFila(a);
    const itemB = await naFila(b);
    const itemC = await naFila(c);
    await ativarProximo({ tenantId, origem: "MANUAL" });

    // C sobe na frente de B.
    const r = await reordenarFila({ tenantId, idsNaOrdem: [itemC, itemB] });
    expect(r.ok).toBe(true);

    await handleDrawFinished(a);
    expect(await statusDaCampanha(c)).toBe("ACTIVE");
    expect(await statusDaCampanha(b)).toBe("QUEUED");
  });

  it("remover da fila devolve a campanha para rascunho e não quebra a ordem", async () => {
    const a = await novaCampanha("A");
    const b = await novaCampanha("B removida");
    const c = await novaCampanha("C");
    await naFila(a);
    const itemB = await naFila(b);
    await naFila(c);
    await ativarProximo({ tenantId, origem: "MANUAL" });

    const r = await removerDaFila({ tenantId, itemId: itemB });
    expect(r.ok).toBe(true);
    expect(await statusDaCampanha(b)).toBe("DRAFT");

    await handleDrawFinished(a);
    expect(await statusDaCampanha(c)).toBe("ACTIVE");
  });

  // -------------------------------------------------------------------------
  // CONCORRÊNCIA E IDEMPOTÊNCIA
  // -------------------------------------------------------------------------

  it("dois workers ativando ao mesmo tempo publicam UM sorteio só", async () => {
    const a = await novaCampanha("A");
    const b = await novaCampanha("B");
    await naFila(a);
    await naFila(b);

    // O caso que o índice parcial e a trava existem para resolver: duas
    // chamadas no mesmo instante, sem nenhuma saber da outra.
    const [um, dois] = await Promise.all([
      ativarProximo({ tenantId, origem: "AUTOMATICO" }),
      ativarProximo({ tenantId, origem: "AUTOMATICO" }),
    ]);

    const vitoriosos = [um, dois].filter((r) => r.ok);
    expect(vitoriosos).toHaveLength(1);

    const cronograma = await garantirCronograma(tenantId);
    const ativos = await prisma.drawScheduleItem.count({
      where: { scheduleId: cronograma.id, status: "ATIVO" },
    });
    expect(ativos).toBe(1);

    const publicadas = await prisma.raffle.count({
      where: { id: { in: [a, b] }, status: "ACTIVE" },
    });
    expect(publicadas).toBe(1);
  });

  it("handleDrawFinished repetido ativa uma vez só", async () => {
    const a = await novaCampanha("A");
    const b = await novaCampanha("B");
    const c = await novaCampanha("C");
    await naFila(a);
    await naFila(b);
    await naFila(c);
    await ativarProximo({ tenantId, origem: "MANUAL" });

    // Webhook reentregue, retry do job, cron disparando duas vezes: é tudo o
    // mesmo caso, e a guarda de status resolve todos.
    await handleDrawFinished(a);
    await handleDrawFinished(a);
    await handleDrawFinished(a);

    expect(await statusDaCampanha(b)).toBe("ACTIVE");
    expect(await statusDaCampanha(c)).toBe("QUEUED");
  });

  it("a campanha saindo da fila no meio da ativação não deixa estado pela metade", async () => {
    const a = await novaCampanha("A");
    await naFila(a);

    // Alguém tirou a campanha da fila por outra tela entre a leitura e a
    // escrita: a guarda `status: QUEUED` no UPDATE é o que impede publicar.
    await prisma.raffle.update({ where: { id: a }, data: { status: "DRAFT" } });

    const r = await ativarProximo({ tenantId, origem: "AUTOMATICO" });
    expect(r.ok).toBe(false);
    // Rollback: nem a campanha subiu, nem o item virou ativo.
    expect(await statusDaCampanha(a)).toBe("DRAFT");
    expect(await statusDoItem(a)).toBe("AGUARDANDO");
  });

  // -------------------------------------------------------------------------
  // O GANCHO DE VERDADE
  // -------------------------------------------------------------------------

  it("o fim do sorteio ao vivo é o que puxa a próxima campanha", async () => {
    const a = await novaCampanha("A com sorteio");
    const b = await novaCampanha("B");
    await naFila(a);
    await naFila(b);
    await ativarProximo({ tenantId, origem: "MANUAL" });

    // A campanha encerra e o sorteio nasce, como o motor faz: FINISHED aqui é
    // o começo do ritual, e não o fim. Enquanto a transmissão não acaba, B NÃO
    // pode subir, ou as duas ficariam no ar ao mesmo tempo.
    // Os carimbos precisam ser estritamente crescentes: o banco cobra isso
    // num CHECK, e é a mesma regra que impede um sorteio nascer com a
    // revelação antes da contagem.
    const agora = Date.now();
    const passado = new Date(agora - 60_000);
    const marco = (segundos: number) => new Date(agora - 60_000 + segundos * 1000);
    await prisma.raffle.update({
      where: { id: a },
      data: { status: "FINISHED" },
    });
    const draw = await prisma.draw.create({
      data: {
        publicId: `DRW-TESTE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        raffleId: a,
        status: "REVEALING",
        raffleEndedAt: passado,
        drawScheduledAt: marco(1),
        drawStartsAt: marco(2),
        revealAt: marco(3),
        winnerRevealAt: marco(4),
        winningNumber: 1,
        // O banco cobra que número sorteado e carimbo de execução existam
        // juntos: um sem o outro seria resultado sem hora ou hora sem
        // resultado.
        drawExecutedAt: marco(2),
        eligibleTicketCount: 1,
      },
    });

    await varrerCronogramas();
    expect(await statusDaCampanha(b)).toBe("QUEUED");

    // Agora o sorteio termina de verdade. É esta transição, e só ela, que
    // libera a fila.
    const depois = await avancarSorteio(draw, new Date());
    expect(depois.status).toBe("FINISHED");

    expect(await statusDoItem(a)).toBe("CONCLUIDO");
    expect(await statusDaCampanha(b)).toBe("ACTIVE");
  });

  it("a varredura fecha o ciclo de quem terminou pela mão do admin", async () => {
    const a = await novaCampanha("A encerrada na mão");
    const b = await novaCampanha("B");
    await naFila(a);
    await naFila(b);
    await ativarProximo({ tenantId, origem: "MANUAL" });

    // Campanha sem sorteio automático, encerrada pelo painel: o gancho do
    // motor nunca vai disparar para ela, e é a varredura que recupera a fila.
    await prisma.raffle.update({
      where: { id: a },
      data: { status: "FINISHED" },
    });

    const r = await varrerCronogramas();
    expect(r.concluidos).toBeGreaterThanOrEqual(1);
    expect(await statusDaCampanha(b)).toBe("ACTIVE");
  });

  it("o intervalo configurado segura a próxima campanha até a hora", async () => {
    const a = await novaCampanha("A");
    const b = await novaCampanha("B");
    await naFila(a);
    await naFila(b);
    await ativarProximo({ tenantId, origem: "MANUAL" });

    const cronograma = await garantirCronograma(tenantId);
    await prisma.drawSchedule.update({
      where: { id: cronograma.id },
      data: { atrasoEmSegundos: 300 },
    });

    await handleDrawFinished(a);
    // Com atraso, quem ativa é a varredura, e só depois da hora.
    expect(await statusDaCampanha(b)).toBe("QUEUED");

    await varrerCronogramas(new Date(Date.now() + 60_000));
    expect(await statusDaCampanha(b)).toBe("QUEUED");

    await varrerCronogramas(new Date(Date.now() + 301_000));
    expect(await statusDaCampanha(b)).toBe("ACTIVE");
  });

  // -------------------------------------------------------------------------
  // INVISIBILIDADE
  // -------------------------------------------------------------------------

  it("campanha na fila não aparece em nenhuma consulta pública", async () => {
    const a = await novaCampanha("Secreta da fila");
    await naFila(a);

    // A mesma cláusula que a home e a lista de campanhas usam.
    const naVitrine = await prisma.raffle.count({
      where: { ...NA_VITRINE, tenantId, id: a },
    });
    expect(naVitrine).toBe(0);

    // E a página do slug, que é achada por findUnique e não passa por where
    // nenhum: a regra tem de ser aplicada por fora.
    const campanha = await prisma.raffle.findUniqueOrThrow({
      where: { id: a },
      select: { status: true, privacy: true },
    });
    expect(visivelAoPublico(campanha)).toBe(false);

    // Depois de ativada, aparece nas duas.
    await ativarProximo({ tenantId, origem: "MANUAL" });
    const depois = await prisma.raffle.findUniqueOrThrow({
      where: { id: a },
      select: { status: true, privacy: true },
    });
    expect(visivelAoPublico(depois)).toBe(true);
    expect(
      await prisma.raffle.count({ where: { ...NA_VITRINE, tenantId, id: a } }),
    ).toBe(1);
  });
});
