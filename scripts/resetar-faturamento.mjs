// Zera o faturamento: apaga as compras (as de teste e as de verdade) e o que
// nasceu delas.
//
// SEM --aplicar ele NÃO APAGA NADA: conta e imprime o que apagaria. Rode
// assim primeiro, sempre, e confira os números antes de liberar.
//
//   node scripts/resetar-faturamento.mjs --tenant queotaskin
//   node scripts/resetar-faturamento.mjs --tenant queotaskin --tudo
//   node scripts/resetar-faturamento.mjs --tenant queotaskin --tudo --aplicar
//
// Contra produção, a URL do banco vai na frente (é a conexão DIRETA, sem
// pooler, que é a que aguenta uma transação grande):
//
//   DATABASE_URL="postgresql://..." node scripts/resetar-faturamento.mjs ...
//
// O QUE CADA ESCOPO APAGA
//
//   (sempre)      Reservas, pagamentos, títulos vendidos e os eventos de
//                 webhook daquelas transações. Junto vão, por cascata do
//                 banco, as caixas surpresa, as raspadinhas e as comissões
//                 daquelas reservas. É o faturamento propriamente dito.
//   --xp          XP, boosts e o progresso de rank de cada cliente. Sem isto
//                 o ranking continua mostrando o nível que veio das compras
//                 que acabaram de sumir.
//   --afiliados   Movimentos, cupons de entrada, o quanto cada indicado
//                 pagou e o progresso de cada afiliado.
//   --sorteios    Sorteios realizados, sementes, ganhador gravado na campanha
//                 e o estado de entrega dela.
//   --visitas     Contadores de visita do site e por campanha.
//   --tudo        Todos os de cima.
//
// O QUE ELE NUNCA APAGA
//
//   Contas de clientes, campanhas, prêmios, catálogo de skins, times, a
//   tabela de taxas do gateway, as configurações e o histórico
//   administrativo. Apagar o faturamento é zerar
//   o dinheiro, e não recomeçar o site do zero: quem comprou continua tendo
//   conta, e a campanha continua existindo com os títulos livres de novo.
//
// Tudo acontece numa TRANSAÇÃO só: ou some tudo o que foi listado, ou não
// some nada. Não existe desfazer depois que ela fecha, então o censo antes
// não é burocracia, é o backup da decisão.

import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const tem = (flag) => args.includes(flag);
const valorDe = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const tudo = tem("--tudo");
const escopo = {
  xp: tudo || tem("--xp"),
  afiliados: tudo || tem("--afiliados"),
  sorteios: tudo || tem("--sorteios"),
  visitas: tudo || tem("--visitas"),
};
const aplicar = tem("--aplicar");
const semPergunta = tem("--sim");
const alvoDoTenant = valorDe("--tenant");

const brl = (valor) =>
  Number(valor ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

async function main() {
  // O tenant é obrigatório. Um banco pode hospedar mais de um site, e um
  // reset que pega "tudo o que existe" apagaria o faturamento do vizinho.
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  if (tenants.length === 0) {
    console.error("Nenhum tenant neste banco. Confira a DATABASE_URL.");
    process.exit(1);
  }
  if (!alvoDoTenant) {
    console.error("Faltou --tenant. Os deste banco:\n");
    for (const t of tenants) {
      console.error(`  ${t.slug.padEnd(20)} ${t.name}  (${t.id})`);
    }
    process.exit(1);
  }
  const tenant = tenants.find(
    (t) => t.slug === alvoDoTenant || t.id === alvoDoTenant,
  );
  if (!tenant) {
    console.error(`Não achei o tenant "${alvoDoTenant}".`);
    process.exit(1);
  }

  const campanhas = await prisma.raffle.findMany({
    where: { tenantId: tenant.id },
    select: { id: true },
  });
  const raffleIds = campanhas.map((c) => c.id);

  const afiliados = await prisma.affiliate.findMany({
    where: { user: { tenantId: tenant.id } },
    select: { id: true },
  });
  const affiliateIds = afiliados.map((a) => a.id);

  // ------------------------------------------------------------- o censo

  const ondeReserva = { raffleId: { in: raffleIds } };

  const [
    reservas,
    peloGateway,
    aprovadasNoPainel,
    titulos,
    pagamentos,
    caixas,
    raspadinhas,
    comissoes,
    xp,
    boosts,
    progressos,
    movimentos,
    cupons,
    qualificacoes,
    sorteios,
    visitasDeCampanha,
    visitasDiarias,
  ] = await Promise.all([
    prisma.reservation.count({ where: ondeReserva }),
    prisma.reservation.aggregate({
      where: { ...ondeReserva, status: "PAID", aprovadaNoPainel: false },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.reservation.aggregate({
      where: { ...ondeReserva, status: "PAID", aprovadaNoPainel: true },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.ticket.count({ where: { raffleId: { in: raffleIds } } }),
    prisma.payment.count({ where: { reservation: ondeReserva } }),
    prisma.surpriseBox.count({ where: { raffleId: { in: raffleIds } } }),
    prisma.raspadinha.count({ where: { raffleId: { in: raffleIds } } }),
    prisma.affiliateCommission.count({ where: { reservation: ondeReserva } }),
    prisma.xpEntry.count({ where: { tenantId: tenant.id } }),
    prisma.boostEntry.count({ where: { tenantId: tenant.id } }),
    prisma.userProgress.count({ where: { tenantId: tenant.id } }),
    prisma.movimentoDeAfiliado.count({
      where: { affiliateId: { in: affiliateIds } },
    }),
    prisma.entradaGratis.count({ where: { affiliateId: { in: affiliateIds } } }),
    prisma.qualificacaoDeIndicado.count({
      where: { affiliateId: { in: affiliateIds } },
    }),
    prisma.draw.count({ where: { raffleId: { in: raffleIds } } }),
    prisma.visitaDeCampanha.count({ where: { raffleId: { in: raffleIds } } }),
    prisma.visitaDiaria.count({ where: { tenantId: tenant.id } }),
  ]);

  console.log(`\nTenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Campanhas: ${raffleIds.length}\n`);
  console.log("O QUE VAI SER APAGADO");
  console.log("  Compras (sempre)");
  console.log(`    reservas ............... ${reservas}`);
  // As duas linhas separadas porque a tela de Relatórios separa: compra
  // aprovada à mão pelo painel não passou por gateway e fica FORA do
  // faturamento de lá. Somadas aqui, o censo mostraria um número maior que o
  // do painel e pareceria estar mirando na coisa errada.
  console.log(
    `      pagas pelo gateway ... ${peloGateway._count._all}  ${brl(peloGateway._sum.totalAmount ?? 0)}   (o faturamento do painel)`,
  );
  console.log(
    `      aprovadas no painel .. ${aprovadasNoPainel._count._all}  ${brl(aprovadasNoPainel._sum.totalAmount ?? 0)}   (fora do faturamento, mas some junto)`,
  );
  console.log(`    títulos vendidos ....... ${titulos}`);
  console.log(`    pagamentos ............. ${pagamentos}`);
  console.log(`    caixas surpresa ........ ${caixas}`);
  console.log(`    raspadinhas ............ ${raspadinhas}`);
  console.log(`    comissões .............. ${comissoes}`);
  linha("XP e rank", escopo.xp, [
    ["lançamentos de XP", xp],
    ["boosts", boosts],
    ["progressos de rank", progressos],
  ]);
  linha("Afiliados", escopo.afiliados, [
    ["movimentos", movimentos],
    ["cupons de entrada", cupons],
    ["qualificações zeradas", qualificacoes],
    ["afiliados com progresso zerado", affiliateIds.length],
  ]);
  linha("Sorteios", escopo.sorteios, [
    ["sorteios realizados", sorteios],
    ["campanhas com ganhador limpo", raffleIds.length],
  ]);
  linha("Visitas", escopo.visitas, [
    ["visitas por campanha", visitasDeCampanha],
    ["visitas diárias", visitasDiarias],
  ]);

  console.log("\nO QUE FICA DE PÉ");
  console.log("  contas de clientes, campanhas, prêmios, catálogo de skins,");
  console.log("  times, a tabela de taxas do gateway, as configurações e o");
  console.log("  histórico administrativo.");

  if (!aplicar) {
    console.log(
      "\nCENSO, nada foi apagado. Para apagar de verdade, repita o comando com --aplicar.\n",
    );
    return;
  }

  // Confirmação por escrito. Digitar o slug é o que separa "rodei sem
  // querer com --aplicar colado do histórico do terminal" de uma decisão.
  if (!semPergunta) {
    if (!process.stdin.isTTY) {
      console.error(
        "\nSem terminal para confirmar. Use --sim se souber o que está fazendo.\n",
      );
      process.exit(1);
    }
    const leitor = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const resposta = await leitor.question(
      `\nIsto NÃO TEM VOLTA. Digite "${tenant.slug}" para confirmar: `,
    );
    leitor.close();
    if (resposta.trim() !== tenant.slug) {
      console.log("Cancelado, nada foi apagado.\n");
      return;
    }
  }

  // ------------------------------------------------------------ o reset

  // Os ids das transações do gateway, colhidos ANTES de apagar os
  // pagamentos: o evento de webhook não tem chave estrangeira para eles, só
  // guarda o mesmo externalId, então depois não haveria como achá-los.
  const externos = await prisma.payment.findMany({
    where: { reservation: ondeReserva },
    select: { externalId: true },
  });

  const resultado = await prisma.$transaction(
    async (tx) => {
      const feito = {};

      // Título antes de reserva, de propósito: a coluna de Ticket é
      // SetNull, então apagar a reserva primeiro deixaria o título órfão
      // segurando o número, que é justamente o que precisa ser liberado.
      feito.titulos = (
        await tx.ticket.deleteMany({ where: { raffleId: { in: raffleIds } } })
      ).count;

      // Pelo mesmo motivo, XP e cupom saem aqui quando o escopo pede: os
      // dois apontam para a reserva com SetNull e sobreviveriam a ela.
      if (escopo.xp) {
        feito.xp = (
          await tx.xpEntry.deleteMany({ where: { tenantId: tenant.id } })
        ).count;
        feito.boosts = (
          await tx.boostEntry.deleteMany({ where: { tenantId: tenant.id } })
        ).count;
        feito.progressos = (
          await tx.userProgress.deleteMany({ where: { tenantId: tenant.id } })
        ).count;
      }

      if (escopo.afiliados) {
        feito.cupons = (
          await tx.entradaGratis.deleteMany({
            where: { affiliateId: { in: affiliateIds } },
          })
        ).count;
        feito.movimentos = (
          await tx.movimentoDeAfiliado.deleteMany({
            where: { affiliateId: { in: affiliateIds } },
          })
        ).count;
        // A qualificação não é apagada: ela é o vínculo de quem indicou
        // quem, e apagá-la desfaria indicações que continuam valendo. O que
        // zera é o dinheiro que passou por ela.
        feito.qualificacoes = (
          await tx.qualificacaoDeIndicado.updateMany({
            where: { affiliateId: { in: affiliateIds } },
            data: { pagoEmCentavos: 0 },
          })
        ).count;
        feito.afiliadosZerados = (
          await tx.affiliate.updateMany({
            where: { id: { in: affiliateIds } },
            data: { progressoEmCentavos: 0 },
          })
        ).count;
      }

      // A reserva por último entre as ligadas a ela: a cascata do banco leva
      // junto pagamento, caixa surpresa, raspadinha e comissão.
      feito.reservas = (
        await tx.reservation.deleteMany({ where: ondeReserva })
      ).count;

      if (externos.length > 0) {
        feito.eventos = (
          await tx.paymentWebhookEvent.deleteMany({
            where: { externalId: { in: externos.map((e) => e.externalId) } },
          })
        ).count;
      }

      if (escopo.sorteios) {
        feito.sementes = (
          await tx.drawSeed.deleteMany({ where: { raffleId: { in: raffleIds } } })
        ).count;
        feito.sorteios = (
          await tx.draw.deleteMany({ where: { raffleId: { in: raffleIds } } })
        ).count;
        feito.campanhasLimpas = (
          await tx.raffle.updateMany({
            where: { id: { in: raffleIds } },
            data: {
              winnerTicketNumber: null,
              winnerDrawnAt: null,
              winnerNote: null,
              deliveryStatus: "AGUARDANDO",
              deliveredAt: null,
              deliveredById: null,
              deliveryNote: null,
            },
          })
        ).count;
      }

      if (escopo.visitas) {
        feito.visitasDeCampanha = (
          await tx.visitaDeCampanha.deleteMany({
            where: { raffleId: { in: raffleIds } },
          })
        ).count;
        feito.visitasDiarias = (
          await tx.visitaDiaria.deleteMany({ where: { tenantId: tenant.id } })
        ).count;
      }

      return feito;
    },
    // Apagar dezenas de milhares de linhas passa dos cinco segundos padrão,
    // e a transação cair no meio é o único jeito de isto sair pela metade.
    { timeout: 300_000, maxWait: 30_000 },
  );

  console.log("\nPRONTO. Linhas afetadas:");
  for (const [nome, quantas] of Object.entries(resultado)) {
    console.log(`  ${nome.padEnd(22)} ${quantas}`);
  }
  console.log("");
}

/** Um bloco do censo, dizendo quando o escopo está desligado. */
function linha(titulo, ligado, itens) {
  console.log(`  ${titulo}${ligado ? "" : "  (desligado)"}`);
  for (const [nome, quantas] of itens) {
    const rotulo = `    ${nome} `.padEnd(29, ".");
    console.log(`${rotulo} ${ligado ? quantas : "-"}`);
  }
}

main()
  .catch((err) => {
    console.error("\nFALHOU, e nada foi apagado:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
