// Roda `prisma migrate deploy` apenas quando DIRECT_URL estiver setada.
//
// Por quê: a Vercel separa env vars por escopo (Production / Preview /
// Development). Quando DIRECT_URL só existe em Production, builds de
// Preview (qualquer PR/branch) falhavam aqui porque o schema do Prisma
// declara `directUrl = env("DIRECT_URL")` e a CLI exige a variável
// mesmo quando tudo que importa é compilar o Next.
//
// Preview não precisa migrar nada — só validar a compilação. Então a
// gente pula com um log informativo e segue pro `next build`. Em
// Production, DIRECT_URL existe e o migrate roda normal; se falhar, o
// build inteiro falha (exit code preservado).

import { spawnSync } from "node:child_process";

if (!process.env.DIRECT_URL) {
  console.log(
    "[build] DIRECT_URL ausente — pulando `prisma migrate deploy`. " +
      "Configure a env var no escopo Production pra ativar migrations."
  );
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
