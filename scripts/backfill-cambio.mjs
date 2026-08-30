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
//
// Tenta a AwesomeAPI primeiro, porque o PTAX não publica o yuan, e cai para o
// PTAX quando ela não responde. A fonte usada fica gravada na linha.

import { PrismaClient } from "@prisma/client";

const GRAVAR = process.argv.includes("--gravar");
const prisma = new PrismaClient();

const BASE =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)";
const AWESOME = "https://economia.awesomeapi.com.br/json/daily";
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

/**
 * A retaguarda, pelo fechamento diário da AwesomeAPI.
 *
 * O Banco Central não publica toda moeda e nem sempre está no ar. Deixar a
 * entrega sem câmbio para sempre é pior do que gravar a taxa de uma fonte de
 * mercado dizendo que foi dela que veio.
 *
 * ask é a VENDA na legenda da API, que é a mesma ponta escolhida no PTAX.
 */
async function awesomeDe(data) {
  const ini = new Date(data);
  ini.setUTCDate(ini.getUTCDate() - JANELA_EM_DIAS);
  const aaaammdd = (d) => emSaoPaulo(d).replace(/-/g, "");
  const q = new URLSearchParams({
    start_date: aaaammdd(ini),
    end_date: aaaammdd(data),
  });
  const token = process.env.AWESOMEAPI_TOKEN?.trim();
  const res = await fetch(`${AWESOME}/CNY-BRL/30?${q}`, {
    headers: token ? { "x-api-key": token } : undefined,
    signal: AbortSignal.timeout(15000),
  });
  // 404 é "essa moeda não existe": resposta legítima, não erro de rede.
  if (!res.ok) return null;
  const lista = await res.json();
  if (!Array.isArray(lista)) return null;
  // Fim do dia pedido em São Paulo: o fechamento sai à tarde.
  const teto = new Date(`${emSaoPaulo(data)}T23:59:59.999-03:00`).getTime();
  let melhor = null;
  for (const o of lista) {
    const venda = Number(o?.ask);
    const t = Number(o?.timestamp);
    if (!Number.isFinite(venda) || venda <= 0 || !Number.isFinite(t)) continue;
    // O timestamp vem em segundos num endpoint e em milissegundos no outro.
    const quando = new Date(t > 1e11 ? t : t * 1000);
    if (quando.getTime() > teto) continue;
    if (!melhor || quando > melhor.dataDoBoletim) {
      melhor = { taxa: venda, dataDoBoletim: quando, fonte: "AWESOMEAPI" };
    }
  }
  return melhor;
}

/**
 * AwesomeAPI na frente; PTAX quando ela não responde.
 *
 * A ordem era a inversa, com a oficial primeiro. Foi trocada porque o PTAX NÃO
 * PUBLICA O YUAN: em produção ele serve o dólar e devolve vazio para CNY.
 * Manter a fonte oficial na frente de uma moeda que ela não tem é gastar uma
 * ida à rede para receber nada, em toda entrega.
 */
async function cambioDe(data) {
  const a = await awesomeDe(data);
  if (a) return a;
  const p = await ptaxDe(data);
  return p ? { ...p, fonte: "PTAX" } : null;
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
        cache.set(chave, await cambioDe(quando));
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
        ` (${p.fonte}, ${emSaoPaulo(p.dataDoBoletim)})`,
    );
    if (GRAVAR) {
      await prisma.raffle.update({
        where: { id: r.id },
        data: {
          deliveryFxRate: p.taxa,
          deliveryFxDate: p.dataDoBoletim,
          deliveryFxSource: p.fonte,
        },
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
