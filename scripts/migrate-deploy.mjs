// Passo de banco do build de produção: aplica as migrations e, quando
// pedido explicitamente, roda o seed.
//
// Migrations só rodam com DIRECT_URL setada. Por quê: a Vercel separa env
// vars por escopo (Production / Preview / Development). Quando DIRECT_URL só
// existe em Production, builds de Preview (qualquer PR/branch) falhavam aqui
// porque o schema do Prisma declara `directUrl = env("DIRECT_URL")` e a CLI
// exige a variável mesmo quando tudo que importa é compilar o Next.
//
// Preview não precisa migrar nada — só validar a compilação. Então a gente
// pula com um log informativo e segue pro `next build`. Em Production,
// DIRECT_URL existe e o migrate roda normal; se falhar, o build inteiro
// falha (exit code preservado).

import { spawnSync } from "node:child_process";

function run(label, args) {
  console.log(`[build] ${label}`);
  const result = spawnSync("npx", args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[build] ${label} falhou (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

// Em produção, banco não configurado é erro de build — não um aviso.
//
// Antes isso só logava e seguia, e o resultado era o pior dos mundos: build
// verde, deploy publicado, e 500 em toda página porque o app não alcança o
// banco. Falhar aqui troca uma investigação de meia hora por uma mensagem
// que diz exatamente o que falta.
//
// Preview continua pulando: ali o objetivo é só validar a compilação, e as
// env vars de banco normalmente existem apenas no escopo Production.
const isProduction = process.env.VERCEL_ENV === "production";
const faltando = ["DATABASE_URL", "DIRECT_URL"].filter((v) => !process.env[v]);

if (faltando.length > 0) {
  if (isProduction) {
    console.error(
      `[build] ${faltando.join(" e ")} não configurada(s) no escopo Production.\n` +
        "\nO app não sobe sem elas — cada página responderia 500.\n" +
        "Pegue as duas em Supabase → Project Settings → Database → Connection string:\n" +
        "  DATABASE_URL  → pooler, porta 6543 (?pgbouncer=true)\n" +
        "  DIRECT_URL    → pooler, porta 5432\n" +
        "\nDetalhes em DEPLOY.md."
    );
    process.exit(1);
  }

  console.log(
    `[build] ${faltando.join(" e ")} ausente(s) — pulando \`prisma migrate deploy\`. ` +
      "Fora de produção isso é esperado: o build só valida a compilação."
  );
  process.exit(0);
}

// Antes de tentar conectar, diz PARA ONDE está indo. Sem isso, um erro de
// conexão no build não distingue "host errado" de "senha errada" de "a env
// var ainda tem o placeholder do .env.example" — e cada hipótese custa um
// redeploy pra testar. Usuário e host aparecem; a senha, nunca.
function descreve(nome) {
  const bruto = process.env[nome];
  if (!bruto) return `${nome}: (vazia)`;
  try {
    const u = new URL(bruto);
    const params = u.search ? ` ${u.search}` : "";
    return `${nome}: ${u.username}@${u.hostname}:${u.port || "5432"}${u.pathname}${params}`;
  } catch {
    return `${nome}: (valor não é uma URL válida — ${bruto.length} caracteres)`;
  }
}

console.log("[build] destino do banco:");
console.log(`[build]   ${descreve("DATABASE_URL")}`);
console.log(`[build]   ${descreve("DIRECT_URL")}`);

run("prisma migrate deploy", ["prisma", "migrate", "deploy"]);

// Seed de dados iniciais. Fica atrás de uma flag porque popular o banco não
// é parte de um build normal — é um passo de bootstrap, feito uma vez.
//
// O primeiro deploy sobe com o banco vazio, e sem um Tenant cadastrado toda
// página pública responde 404 (o host não resolve pra tenant nenhum). Setar
// RUN_SEED=1 no primeiro build resolve isso sem precisar de acesso direto ao
// Postgres, que num ambiente serverless a gente não tem.
//
// O seed é idempotente (upsert por slug/celular e guardas de "já existe"),
// então repetir não duplica nada. Ainda assim: remova a variável depois do
// primeiro deploy — build não é lugar de escrever dados.
if (process.env.RUN_SEED === "1") {
  run("prisma db seed (RUN_SEED=1)", ["tsx", "prisma/seed.ts"]);
  console.log(
    "[build] Seed concluído. Remova RUN_SEED do projeto na Vercel — " +
      "ele não precisa rodar de novo."
  );
} else {
  console.log("[build] RUN_SEED não setada — pulando o seed.");
}
