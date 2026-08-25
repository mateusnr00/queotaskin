// Cliente Prisma singleton.
//
// Por que singleton: em dev, o Next.js faz "hot reload" e cria múltiplos módulos.
// Sem o cache em `globalThis`, cada reload criaria uma nova conexão com o banco,
// estourando o limite do Postgres. Em produção isso não acontece, então só usamos
// o cache fora de production.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
