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

if (!process.env.DIRECT_URL) {
  console.log(
    "[build] DIRECT_URL ausente — pulando `prisma migrate deploy`. " +
      "Configure a env var no escopo Production pra ativar migrations."
  );
  process.exit(0);
}

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
