// Adiciona skins ao catálogo a partir do nome, buscando a ficha na base
// pública de itens de Counter-Strike.
//
// Uso:
//   npx tsx scripts/adicionar-skins.ts "AK-47 | Redline (Field-Tested)" "karambit doppler fn phase 2"
//   npx tsx scripts/adicionar-skins.ts --arquivo lista.txt
//   npx tsx scripts/adicionar-skins.ts --simular "awp dragon lore"
//   npx tsx scripts/adicionar-skins.ts --categoria Knives --categoria Gloves
//   npx tsx scripts/adicionar-skins.ts --com-desgaste "ak47 redline ft"
//   npx tsx scripts/adicionar-skins.ts --sql --tenant <id> --categoria Knives > facas.sql
//
// Por padrão o catálogo guarda uma linha por skin, SEM o desgaste no nome:
// quem cria a campanha escolhe a skin e o float depois, então "AK-47 |
// Redline" basta e as cinco variações só encheriam a lista. Com
// --com-desgaste, volta a gerar "AK-47 | Redline (Field-Tested)".
//
// --categoria adiciona tudo de uma categoria de uma vez (Knives, Gloves,
// Rifles, Pistols, SMGs, Heavy, Equipment, Agents).
//
// O nome pode vir como está na Steam ou digitado de cabeça: "ak47 redline ft"
// acha a mesma linha que "AK-47 | Redline (Field-Tested)". Quando não acha,
// o script NÃO cadastra nada e imprime os nomes mais parecidos, porque um
// cadastro errado em silêncio é pior do que um "não achei".
//
// --sql imprime o INSERT em vez de gravar, para quando o banco de destino não
// é alcançável por string de conexão daqui (produção). Exige --tenant, porque
// sem conexão não há como descobrir o id sozinho. O comando é idempotente por
// ON CONFLICT, então aplicar duas vezes não duplica.
//
// Nada do arquivo de 5 MB entra no repositório: ele é baixado na hora e fica
// num cache em /tmp por 24h.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";

import {
  montarIndice,
  procurar,
  type EntradaDoCatalogo,
  type ItemDaApi,
} from "../src/lib/cs2-catalogo";

const BASE = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";
const CACHE = join(tmpdir(), "cs2-catalogo");
const VALIDADE_MS = 24 * 60 * 60 * 1000;

const prisma = new PrismaClient();

async function baixarComCache(arquivo: string): Promise<ItemDaApi[]> {
  await mkdir(CACHE, { recursive: true });
  const destino = join(CACHE, arquivo);
  try {
    const info = await stat(destino);
    if (Date.now() - info.mtimeMs < VALIDADE_MS) {
      return JSON.parse(await readFile(destino, "utf8"));
    }
  } catch {
    // Sem cache ainda: segue para o download.
  }
  process.stderr.write(`baixando ${arquivo}...\n`);
  const resposta = await fetch(`${BASE}/${arquivo}`);
  if (!resposta.ok) {
    throw new Error(`${arquivo}: HTTP ${resposta.status}`);
  }
  const texto = await resposta.text();
  await writeFile(destino, texto);
  return JSON.parse(texto);
}

/** Aspas simples dobradas, que é como Postgres escapa string. */
function citar(valor: string | null): string {
  if (valor === null) return "NULL";
  return `'${valor.replace(/'/g, "''")}'`;
}

/**
 * INSERT idempotente para aplicar num banco que não dá para alcançar por
 * string de conexão daqui.
 *
 * O id do tenant entra citado, e não como marcador para trocar depois: o
 * "$TENANT$" que estava aqui é âncora de fim de linha no sed e ainda esbarra
 * no dollar-quoting do Postgres. Trocá-lo com sed comeu metade da linha e o
 * INSERT foi recusado por chave estrangeira, apontando para um erro que não
 * era o de verdade.
 *
 * O id da linha sai de gen_random_uuid() e não do cuid do Prisma: o campo é String,
 * aceita os dois, e pedir um cuid exigiria carregar o gerador só para isso.
 * ON CONFLICT usa a única de (tenantId, name), a mesma que o upsert do modo
 * normal usa, então os dois caminhos se comportam igual.
 */
/**
 * Quantas tuplas por comando. Existe porque alguns caminhos de aplicação
 * (console web, API) recusam um SQL muito grande, e porque cortar o arquivo
 * gerado com ferramenta de texto depois deu errado: o separador comia o
 * parêntese que fecha cada tupla e o INSERT saía inválido. Quem sabe onde a
 * tupla termina é quem a escreve.
 */
const TUPLAS_POR_COMANDO = 100;

function gerarSql(linhas: EntradaDoCatalogo[], tenantId: string): string {
  const lotes: string[] = [];
  for (let i = 0; i < linhas.length; i += TUPLAS_POR_COMANDO) {
    lotes.push(umInsert(linhas.slice(i, i + TUPLAS_POR_COMANDO), tenantId));
  }
  return (
    `-- ${linhas.length} linha(s) para o tenant ${tenantId}, em ${lotes.length} comando(s).\n` +
    lotes.join("\n\n")
  );
}

function umInsert(linhas: EntradaDoCatalogo[], tenantId: string): string {
  const valores = linhas
    .map(
      (l) =>
        `  (gen_random_uuid()::text, ${citar(tenantId)}, ${citar(l.nome)}, ${citar(l.imagem)}, ` +
        `${l.raridade ? `'${l.raridade}'::"SkinRarity"` : "NULL"}, ` +
        `${l.desgaste ? `'${l.desgaste}'::"SkinWear"` : "NULL"}, ` +
        `${citar(l.colecao)}, now(), now())`,
    )
    .join(",\n");
  return (
    `INSERT INTO "SkinTemplate"\n` +
    `  (id, "tenantId", name, "imageUrl", "skinRarity", "skinWear", "skinCollection", "createdAt", "updatedAt")\n` +
    `VALUES\n${valores}\n` +
    `ON CONFLICT ("tenantId", name) DO UPDATE SET\n` +
    `  "imageUrl" = EXCLUDED."imageUrl",\n` +
    `  "skinRarity" = EXCLUDED."skinRarity",\n` +
    `  "skinWear" = EXCLUDED."skinWear",\n` +
    `  "skinCollection" = EXCLUDED."skinCollection",\n` +
    `  "updatedAt" = now();`
  );
}

function lerArgumentos() {
  const args = process.argv.slice(2);
  const nomes: string[] = [];
  const categorias: string[] = [];
  let arquivo: string | null = null;
  let simular = false;
  let comDesgaste = false;
  let sql = false;
  let tenant: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--arquivo") arquivo = args[++i] ?? null;
    else if (args[i] === "--categoria") categorias.push(args[++i] ?? "");
    else if (args[i] === "--simular") simular = true;
    else if (args[i] === "--com-desgaste") comDesgaste = true;
    else if (args[i] === "--sql") sql = true;
    else if (args[i] === "--tenant") tenant = args[++i] ?? null;
    else nomes.push(args[i]);
  }
  return { nomes, categorias, arquivo, simular, comDesgaste, sql, tenant };
}

async function main() {
  const { nomes, categorias, arquivo, simular, comDesgaste, sql, tenant } =
    lerArgumentos();
  const pedidos = [...nomes];
  if (arquivo) {
    const conteudo = await readFile(arquivo, "utf8");
    for (const linha of conteudo.split("\n")) {
      const limpo = linha.trim();
      if (limpo && !limpo.startsWith("#")) pedidos.push(limpo);
    }
  }
  if (pedidos.length === 0 && categorias.length === 0) {
    process.stderr.write(
      'uso: npx tsx scripts/adicionar-skins.ts "AK-47 | Redline" [...]\n' +
        "     npx tsx scripts/adicionar-skins.ts --arquivo lista.txt [--simular]\n" +
        "     npx tsx scripts/adicionar-skins.ts --categoria Knives --categoria Gloves\n",
    );
    process.exit(1);
  }

  const [skins, agentes] = await Promise.all([
    baixarComCache("skins.json"),
    baixarComCache("agents.json"),
  ]);
  const indice = montarIndice(skins, agentes, { comDesgaste });
  process.stderr.write(
    `indice: ${indice.length} linhas (${comDesgaste ? "com" : "sem"} desgaste no nome)\n\n`,
  );

  const achados: { pedido: string; linha: EntradaDoCatalogo }[] = [];
  const perdidos: { pedido: string; sugestoes: string[] }[] = [];

  for (const pedido of pedidos) {
    const r = procurar(pedido, indice);
    if (r.exata) achados.push({ pedido, linha: r.exata });
    else perdidos.push({ pedido, sugestoes: r.sugestoes.map((s) => s.nome) });
  }

  // Categorias inteiras. Entram depois dos nomes e sem repetir o que já veio
  // por nome, para uma lista que mistura os dois não gravar duas vezes.
  const jaTem = new Set(achados.map((a) => a.linha.nome));
  for (const categoria of categorias) {
    const alvo = categoria.trim().toLowerCase();
    const daCategoria = indice.filter((l) => l.categoria.toLowerCase() === alvo);
    if (daCategoria.length === 0) {
      const existentes = [...new Set(indice.map((l) => l.categoria))].sort();
      throw new Error(
        `categoria "${categoria}" não existe. Disponíveis: ${existentes.join(", ")}`,
      );
    }
    for (const linha of daCategoria) {
      if (jaTem.has(linha.nome)) continue;
      jaTem.add(linha.nome);
      achados.push({ pedido: `--categoria ${categoria}`, linha });
    }
    process.stderr.write(`categoria ${categoria}: ${daCategoria.length} linhas\n`);
  }

  // Em --sql a saída padrão é só o comando: o relatório iria parar dentro do
  // arquivo redirecionado, no meio do SQL. Vai para o erro, que aparece no
  // terminal do mesmo jeito.
  const console_ = sql
    ? { log: (t = "") => process.stderr.write(`${t}\n`) }
    : console;

  // Os que falharam saem primeiro: é o que exige decisão de quem está lendo.
  if (perdidos.length > 0) {
    console_.log(`NAO ENCONTRADOS (${perdidos.length}):`);
    for (const p of perdidos) {
      console_.log(`  "${p.pedido}"`);
      for (const s of p.sugestoes) console_.log(`      talvez: ${s}`);
    }
    console_.log();
  }

  if (achados.length > 0) {
    const porNome = achados.filter((a) => !a.pedido.startsWith("--categoria"));
    console_.log(`ENCONTRADOS (${achados.length}):`);
    for (const { pedido, linha } of porNome) {
      const igual = pedido === linha.nome;
      console_.log(
        `  ${linha.nome}` +
          (igual ? "" : `   <- "${pedido}"`) +
          `   [${linha.categoria}, ${linha.raridade ?? "sem raridade"}]`,
      );
    }
    // Categoria inteira sai resumida: listar 576 facas uma a uma esconderia
    // justamente o que precisa de atenção, que são os nomes não encontrados.
    const porCategoria = achados.filter((a) => a.pedido.startsWith("--categoria"));
    const resumo = new Map<string, number>();
    for (const a of porCategoria) {
      resumo.set(a.linha.categoria, (resumo.get(a.linha.categoria) ?? 0) + 1);
    }
    for (const [categoria, quantas] of resumo) {
      console_.log(`  ${quantas} de ${categoria} (categoria inteira)`);
    }
    console_.log();
  }

  if (simular) {
    console.log("(--simular: nada foi gravado)");
    return;
  }

  if (sql) {
    if (perdidos.length > 0) {
      throw new Error(
        `${perdidos.length} nome(s) não encontrado(s): não gero SQL parcial em silêncio.`,
      );
    }
    if (!tenant) {
      throw new Error("--sql precisa de --tenant <id>: sem banco não dá para descobrir.");
    }
    console.log(gerarSql(achados.map((a) => a.linha), tenant));
    return;
  }

  // O banco só entra em cena na hora de gravar. Antes ficava no começo, e
  // --simular, cujo motivo de existir é conferir os nomes sem tocar em nada,
  // morria com "não alcanço o banco" sem ter conferido nome nenhum.
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  if (tenants.length !== 1) {
    throw new Error(
      `esperava 1 tenant, achei ${tenants.length}: ${tenants.map((t) => t.id).join(", ")}`,
    );
  }
  const tenantId = tenants[0].id;

  let criadas = 0;
  let atualizadas = 0;
  for (const { linha } of achados) {
    // upsert pelo nome: rodar duas vezes com a mesma lista não duplica, e
    // reexecutar depois de a API corrigir uma ficha atualiza a linha.
    const existente = await prisma.skinTemplate.findUnique({
      where: { tenantId_name: { tenantId, name: linha.nome } },
      select: { id: true },
    });
    const dados = {
      imageUrl: linha.imagem,
      skinRarity: linha.raridade,
      skinWear: linha.desgaste,
      skinWears: linha.desgastesDisponiveis,
      skinCollection: linha.colecao,
    };
    if (existente) {
      await prisma.skinTemplate.update({ where: { id: existente.id }, data: dados });
      atualizadas++;
    } else {
      await prisma.skinTemplate.create({
        data: { tenantId, name: linha.nome, ...dados },
      });
      criadas++;
    }
  }

  console.log(`gravado: ${criadas} nova(s), ${atualizadas} atualizada(s)`);
  if (perdidos.length > 0) process.exitCode = 1;
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
