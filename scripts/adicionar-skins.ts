// Adiciona skins ao catálogo a partir do nome, buscando a ficha na base
// pública de itens de Counter-Strike.
//
// Uso:
//   npx tsx scripts/adicionar-skins.ts "AK-47 | Redline (Field-Tested)" "karambit doppler fn phase 2"
//   npx tsx scripts/adicionar-skins.ts --arquivo lista.txt
//   npx tsx scripts/adicionar-skins.ts --simular "awp dragon lore ft"
//
// O nome pode vir como está na Steam ou digitado de cabeça: "ak47 redline ft"
// acha a mesma linha que "AK-47 | Redline (Field-Tested)". Quando não acha,
// o script NÃO cadastra nada e imprime os nomes mais parecidos, porque um
// cadastro errado em silêncio é pior do que um "não achei".
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

function lerArgumentos() {
  const args = process.argv.slice(2);
  const nomes: string[] = [];
  let arquivo: string | null = null;
  let simular = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--arquivo") arquivo = args[++i] ?? null;
    else if (args[i] === "--simular") simular = true;
    else nomes.push(args[i]);
  }
  return { nomes, arquivo, simular };
}

async function main() {
  const { nomes, arquivo, simular } = lerArgumentos();
  const pedidos = [...nomes];
  if (arquivo) {
    const conteudo = await readFile(arquivo, "utf8");
    for (const linha of conteudo.split("\n")) {
      const limpo = linha.trim();
      if (limpo && !limpo.startsWith("#")) pedidos.push(limpo);
    }
  }
  if (pedidos.length === 0) {
    process.stderr.write(
      'uso: npx tsx scripts/adicionar-skins.ts "AK-47 | Redline (Field-Tested)" [...]\n' +
        "     npx tsx scripts/adicionar-skins.ts --arquivo lista.txt [--simular]\n",
    );
    process.exit(1);
  }

  // Um tenant só neste deploy; com mais de um, o alvo passa a ser argumento.
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  if (tenants.length !== 1) {
    throw new Error(
      `esperava 1 tenant, achei ${tenants.length}: ${tenants.map((t) => t.id).join(", ")}`,
    );
  }
  const tenantId = tenants[0].id;

  const [skins, agentes] = await Promise.all([
    baixarComCache("skins.json"),
    baixarComCache("agents.json"),
  ]);
  const indice = montarIndice(skins, agentes);
  process.stderr.write(`indice: ${indice.length} linhas\n\n`);

  const achados: { pedido: string; linha: EntradaDoCatalogo }[] = [];
  const perdidos: { pedido: string; sugestoes: string[] }[] = [];

  for (const pedido of pedidos) {
    const r = procurar(pedido, indice);
    if (r.exata) achados.push({ pedido, linha: r.exata });
    else perdidos.push({ pedido, sugestoes: r.sugestoes.map((s) => s.nome) });
  }

  // Os que falharam saem primeiro: é o que exige decisão de quem está lendo.
  if (perdidos.length > 0) {
    console.log(`NAO ENCONTRADOS (${perdidos.length}):`);
    for (const p of perdidos) {
      console.log(`  "${p.pedido}"`);
      for (const s of p.sugestoes) console.log(`      talvez: ${s}`);
    }
    console.log();
  }

  if (achados.length > 0) {
    console.log(`ENCONTRADOS (${achados.length}):`);
    for (const { pedido, linha } of achados) {
      const igual = pedido === linha.nome;
      console.log(
        `  ${linha.nome}` +
          (igual ? "" : `   <- "${pedido}"`) +
          `   [${linha.categoria}, ${linha.raridade ?? "sem raridade"}]`,
      );
    }
    console.log();
  }

  if (simular) {
    console.log("(--simular: nada foi gravado)");
    return;
  }

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
