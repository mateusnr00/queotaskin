// Preenche o câmbio das entregas que já tinham custo antes de ele existir.
//
// POR QUE UM SCRIPT E NÃO A MIGRATION
//
// A migration roda dentro do build e dentro de uma transação, e precisa ser
// determinística. Este preenchimento vai à REDE, uma vez por dia distinto de
// entrega: numa migration, o Banco Central fora do ar derrubaria o deploy, e
// uma tentativa parcial deixaria o banco num meio-termo difícil de retomar.
//
// Aqui é retomável por natureza: só toca em linha com custo e sem câmbio, então
// rodar de novo continua de onde parou e nunca reescreve o que já foi gravado.
//
// Uso:
//   node scripts/backfill-cambio.mjs            (mostra o que faria)
//   node scripts/backfill-cambio.mjs --gravar   (grava)

import { PrismaClient } from "@prisma/client";

const GRAVAR = process.argv.includes("--gravar");
const prisma = new PrismaClient();

const BASE =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)";
const JANELA_EM_DIAS = 12;

const emSaoPaulo = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/** MM-DD-YYYY: o PTAX quer a data no formato americano. */
const paraPtax = (d) => {
  const [a, m, dia] = emSaoPaulo(d).split("-");
  return `${m}-${dia}-${a}`;
};

const instante = (txt) => {
  const m = String(txt ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  // Sem o offset, o boletim das 13h de Brasília viraria 13h UTC.
  return m
    ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000-03:00`)
    : null;
};

async function ptaxDe(data) {
  const ini = new Date(data);
  ini.setUTCDate(ini.getUTCDate() - JANELA_EM_DIAS);
  const q = new URLSearchParams({
    "@moeda": "'CNY'",
    "@dataInicial": `'${paraPtax(ini)}'`,
    "@dataFinalCotacao": `'${paraPtax(data)}'`,
    $format: "json",
  });
  const res = await fetch(`${BASE}?${q}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Olinda respondeu ${res.status}`);
  const lista = (await res.json())?.value;
  if (!Array.isArray(lista)) return null;
  let melhor = null;
  for (const o of lista) {
    if (typeof o?.tipoBoletim === "string" && !/fechamento/i.test(o.tipoBoletim))
      continue;
    const venda = Number(o?.cotacaoVenda);
    const quando = instante(o?.dataHoraCotacao);
    if (!Number.isFinite(venda) || venda <= 0 || !quando) continue;
    if (!melhor || quando > melhor.dataDoBoletim) {
      melhor = { taxa: venda, dataDoBoletim: quando };
    }
  }
  return melhor;
}

const main = async () => {
  const alvo = await prisma.raffle.findMany({
    where: { deliveryCost: { not: null }, deliveryFxRate: null },
    select: {
      id: true,
      title: true,
      deliveryCost: true,
      deliveredAt: true,
      winnerDrawnAt: true,
    },
    orderBy: { winnerDrawnAt: "asc" },
  });

  if (alvo.length === 0) {
    console.log("Nada a preencher: toda entrega com custo já tem câmbio.");
    return;
  }
  console.log(
    `${alvo.length} entrega(s) com custo e sem câmbio.` +
      (GRAVAR ? "" : " Ensaio: nada será gravado (use --gravar)."),
  );

  // Um pedido por DIA distinto, e não por entrega: várias entregas do mesmo dia
  // usam o mesmo boletim, e repetir a chamada seria bater no Banco Central sem
  // motivo.
  const cache = new Map();
  let gravadas = 0;
  let semBoletim = 0;

  for (const r of alvo) {
    const quando = r.deliveredAt ?? r.winnerDrawnAt;
    if (!quando) {
      console.log(`  - ${r.title}: sem data, pulando.`);
      semBoletim++;
      continue;
    }
    const chave = emSaoPaulo(quando);
    if (!cache.has(chave)) {
      try {
        cache.set(chave, await ptaxDe(quando));
      } catch (e) {
        console.log(`  ! ${chave}: ${e.message}. Rode de novo depois.`);
        cache.set(chave, null);
      }
    }
    const p = cache.get(chave);
    if (!p) {
      console.log(`  - ${r.title} (${chave}): sem boletim na janela.`);
      semBoletim++;
      continue;
    }
    const emReais = Number(r.deliveryCost) * p.taxa;
    console.log(
      `  ${GRAVAR ? "+" : "?"} ${r.title} (${chave}): ¥ ${r.deliveryCost}` +
        ` x ${p.taxa} = R$ ${emReais.toFixed(2)}` +
        ` (boletim de ${emSaoPaulo(p.dataDoBoletim)})`,
    );
    if (GRAVAR) {
      await prisma.raffle.update({
        where: { id: r.id },
        data: { deliveryFxRate: p.taxa, deliveryFxDate: p.dataDoBoletim },
      });
      gravadas++;
    }
  }

  console.log(
    GRAVAR
      ? `\n${gravadas} gravada(s), ${semBoletim} sem boletim.`
      : `\nEnsaio terminado. ${alvo.length - semBoletim} seriam gravadas.`,
  );
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
