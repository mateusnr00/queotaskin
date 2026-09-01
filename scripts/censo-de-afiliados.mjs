// Censo do programa de afiliados. SÓ LEITURA: nenhuma linha é criada,
// alterada ou apagada.
//
// Serve para decidir a migração da regra antiga (um cupom a cada R$ 10 de
// progresso geral) para a nova (um cupom por indicado, uma vez na vida).
// Rode contra o banco que interessa e mande a saída:
//
//   DATABASE_URL="postgresql://..." node scripts/censo-de-afiliados.mjs
//
// Em produção na Vercel, a URL está em DATABASE_URL (ou DIRECT_URL, que é a
// conexão direta, sem pooler, e serve igual para uma leitura destas).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const brl = (centavos) =>
  (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

async function main() {
  const [afiliados, porStatus, indicados, porEstado, porTipo] =
    await Promise.all([
      prisma.affiliate.count(),
      prisma.affiliate.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.user.count({ where: { referredByAffiliateId: { not: null } } }),
      prisma.entradaGratis.groupBy({ by: ["estado"], _count: { _all: true } }),
      prisma.movimentoDeAfiliado.groupBy({
        by: ["tipo"],
        _count: { _all: true },
        _sum: { entradas: true, centavos: true },
      }),
    ]);

  // Quantos cupons cada pessoa indicada gerou. Na regra nova o teto é um.
  const porIndicado = await prisma.movimentoDeAfiliado.groupBy({
    by: ["indicadoId"],
    where: { tipo: "ENTRADA_LIBERADA" },
    _sum: { entradas: true },
  });
  const acimaDoTeto = porIndicado.filter((p) => (p._sum.entradas ?? 0) > 1);

  const progresso = await prisma.affiliate.aggregate({
    _sum: { progressoEmCentavos: true },
    _max: { progressoEmCentavos: true },
  });

  const estado = Object.fromEntries(
    porEstado.map((e) => [e.estado, e._count._all]),
  );

  console.log("=".repeat(60));
  console.log("CENSO DO PROGRAMA DE AFILIADOS");
  console.log("=".repeat(60));
  console.log(`afiliados ................. ${afiliados}`);
  for (const s of porStatus) {
    console.log(`  ${s.status.padEnd(22, ".")} ${s._count._all}`);
  }
  console.log(`pessoas indicadas ......... ${indicados}`);
  console.log("");
  console.log(`cupons disponíveis ........ ${estado.DISPONIVEL ?? 0}`);
  console.log(`cupons reservados ......... ${estado.RESERVADA ?? 0}`);
  console.log(`cupons utilizados ......... ${estado.USADA ?? 0}`);
  console.log(
    `cupons no total ........... ${(estado.DISPONIVEL ?? 0) + (estado.RESERVADA ?? 0) + (estado.USADA ?? 0)}`,
  );
  console.log("");
  console.log(`indicados com MAIS DE UM cupom gerado: ${acimaDoTeto.length}`);
  console.log(
    `progresso geral acumulado ... ${brl(progresso._sum.progressoEmCentavos ?? 0)} (maior: ${brl(progresso._max.progressoEmCentavos ?? 0)})`,
  );
  console.log("");
  console.log("movimentos:");
  for (const m of porTipo) {
    console.log(
      `  ${m.tipo.padEnd(22, ".")} ${String(m._count._all).padStart(5)} linhas | entradas ${m._sum.entradas ?? 0} | ${brl(m._sum.centavos ?? 0)}`,
    );
  }
  console.log("");

  // Amostra de nomes, para separar dado real de resíduo de teste. Só o
  // primeiro nome, e no máximo dez: o censo não é lugar de listar cliente.
  const amostra = await prisma.affiliate.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    select: { code: true, createdAt: true, user: { select: { name: true } } },
  });
  console.log("últimos afiliados cadastrados:");
  for (const a of amostra) {
    console.log(
      `  ${a.code.padEnd(20)} ${a.user.name.split(" ")[0]} · ${a.createdAt.toISOString().slice(0, 10)}`,
    );
  }
  console.log("=".repeat(60));
}

main()
  .catch((err) => {
    console.error("censo falhou:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
