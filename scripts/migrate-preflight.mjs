#!/usr/bin/env node
// Preflight de migracao (P1-C §16). Read-only: mostra o status das migrations
// pendentes e roda as queries de integridade (o OPERADOR executa contra o banco
// alvo com DIRECT_URL). NAO aplica nada, NAO escreve.
import { execSync } from "node:child_process";

console.log("== Migrate preflight (read-only) ==");
if (!process.env.DIRECT_URL) {
  console.error("DIRECT_URL ausente: aponte para o banco alvo (migration_role).");
  process.exit(1);
}
try {
  execSync("npx prisma migrate status", { stdio: "inherit" });
} catch {
  console.log("\n(migrations pendentes acima; aplique com `npm run db:migrate:deploy`)");
}
console.log("\nQueries de integridade recomendadas (rode manualmente, read-only):");
console.log("  - contagem de PaymentWebhookEvent (dimensiona lock do unique index)");
console.log("  - duplicados (provider, providerEventId) nao-nulos: deve ser 0");
console.log("  - Payment PENDING antigos (backlog de reconciliacao)");
