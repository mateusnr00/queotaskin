// Matriz de rate-limit da autenticação sensível. Buckets SEPARADOS por
// operação (não um contador global) e chaves em HMAC (nunca CPF/telefone
// puro). FAIL-CLOSED: se o banco falhar de forma inesperada, a operação
// sensível é negada - um erro de infra não pode virar tentativas ilimitadas.
import { prisma } from "@/lib/db";
import { hmac } from "@/lib/auth/cripto";

export type BucketDeAuth =
  | "REQUEST_OTP"
  | "VERIFY_OTP"
  | "RESEND_OTP"
  | "LOGIN_FAILURE"
  | "ACCOUNT_RECOVERY";

// Teto por bucket dentro da janela. Escolhas explícitas (documentadas), não
// silenciosas.
const LIMITE: Record<BucketDeAuth, number> = {
  REQUEST_OTP: 5,       // pedidos de código por identidade/janela
  VERIFY_OTP: 10,       // verificações por identidade/janela (o challenge tem o seu próprio limite de 5)
  RESEND_OTP: 4,        // reenvios por identidade/janela
  LOGIN_FAILURE: 10,    // falhas de login por identidade/janela
  ACCOUNT_RECOVERY: 3,  // pedidos de recuperação por identidade/janela
};

const JANELA_MS = 15 * 60 * 1000;
const BLOQUEIO_MS = 15 * 60 * 1000;

/// Monta a chave da tabela LoginAttempt em HMAC. `dimensao` distingue por quê
/// se está freando (cpf, telefone, ip, tenant, challenge...). O valor puro
/// NUNCA entra na chave.
export function chaveDeAuth(bucket: BucketDeAuth, dimensao: string, valor: string): string {
  return `auth:${bucket}:${dimensao}:${hmac(valor)}`;
}

export interface ResultadoRate {
  permitido: boolean;
  motivo?: "BLOQUEADO" | "ERRO_FAIL_CLOSED";
}

/// Verifica se alguma chave está bloqueada agora. FAIL-CLOSED em erro.
export async function permitido(chaves: string[]): Promise<ResultadoRate> {
  try {
    const agora = new Date();
    const bloqueados = await prisma.loginAttempt.count({
      where: { chave: { in: chaves }, bloqueadoAte: { gt: agora } },
    });
    return bloqueados === 0 ? { permitido: true } : { permitido: false, motivo: "BLOQUEADO" };
  } catch (err) {
    console.error("[auth rate-limit] falha ao consultar (fail-closed):", err);
    return { permitido: false, motivo: "ERRO_FAIL_CLOSED" };
  }
}

/// Registra uma ocorrência (tentativa/pedido) em cada chave e bloqueia ao
/// estourar o teto do bucket.
export async function registrar(bucket: BucketDeAuth, chaves: string[]): Promise<void> {
  const agora = new Date();
  const inicioJanela = new Date(agora.getTime() - JANELA_MS);
  const teto = LIMITE[bucket];
  for (const chave of chaves) {
    try {
      const atual = await prisma.loginAttempt.findUnique({ where: { chave } });
      if (!atual || atual.desde < inicioJanela) {
        await prisma.loginAttempt.upsert({
          where: { chave },
          create: { chave, falhas: 1, desde: agora },
          update: { falhas: 1, desde: agora, bloqueadoAte: null },
        });
        continue;
      }
      const falhas = atual.falhas + 1;
      await prisma.loginAttempt.update({
        where: { chave },
        data: { falhas, bloqueadoAte: falhas >= teto ? new Date(agora.getTime() + BLOQUEIO_MS) : null },
      });
    } catch (err) {
      console.error("[auth rate-limit] falha ao registrar:", err);
    }
  }
}

export async function limpar(chaves: string[]): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({ where: { chave: { in: chaves } } });
  } catch (err) {
    console.error("[auth rate-limit] falha ao limpar:", err);
  }
}
