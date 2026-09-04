// Cliente Prisma singleton.
//
// Por que singleton: em dev, o Next.js faz "hot reload" e cria múltiplos módulos.
// Sem o cache em `globalThis`, cada reload criaria uma nova conexão com o banco,
// estourando o limite do Postgres. Em produção isso não acontece, então só usamos
// o cache fora de production.

import { PrismaClient } from "@prisma/client";
import { assertSafeEnvironment } from "@/test/assert-safe-environment";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const base =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// TRAVA DE ESCRITA EM MODO TESTE - by construction, não por disciplina.
//
// Só em NODE_ENV=test: qualquer operação de ESCRITA é recusada a menos que a
// barreira de ambiente esteja satisfeita (opt-in + host local + banco em
// allowlist + sentinela). Assim, um teste novo que escreva sem passar pelo
// helper `suiteDeIntegracao` AINDA não consegue tocar o banco se a barreira
// não provar que ele é descartável. Fora de teste, `base` é usado direto, sem
// custo nenhum.
const OPS_DE_ESCRITA = new Set([
  "create", "createMany", "createManyAndReturn", "update", "updateMany",
  "upsert", "delete", "deleteMany", "executeRaw", "executeRawUnsafe", "$executeRaw",
]);

function clienteComTravaDeTeste(): PrismaClient {
  let liberado: boolean | null = null;
  const podeEscrever = (): boolean => {
    if (liberado === null) {
      try { assertSafeEnvironment(); liberado = true; }
      catch { liberado = false; }
    }
    return liberado;
  };
  return base.$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        if (OPS_DE_ESCRITA.has(operation) && !podeEscrever()) {
          throw new Error(
            `[db] escrita "${operation}" bloqueada: a barreira de ambiente de teste não foi satisfeita ` +
            `(precisa ALLOW_DESTRUCTIVE_TESTS=true + banco local com sentinela).`,
          );
        }
        return query(args);
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma: PrismaClient =
  process.env.NODE_ENV === "test" ? clienteComTravaDeTeste() : base;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = base;
}
