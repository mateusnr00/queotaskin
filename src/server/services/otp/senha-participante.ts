// Autenticacao de participante por CPF + SENHA (FASE 10.2). Reusa o bcrypt do
// admin (cost 12). CPF e IDENTIFICADOR; a senha e o segredo. Nome/telefone nao
// participam. Sem OTP. Fail-closed e neutro contra enumeracao.
import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { hmac } from "@/lib/auth/cripto";
import { chaveDeAuth, limpar, permitido, registrar } from "@/server/services/otp/rate-limit";
import { verificarDesafio } from "@/server/services/otp/otp-service";

const BCRYPT_COST = 12;
// Hash valido de uma senha aleatoria, para comparar quando a conta nao existe /
// nao tem senha: mantem o custo de tempo parecido (mitiga oraculo de existencia).
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO3f9m4iF0m3O0kQ9m3n2Xk1n0oQ2m3nS";

export interface IdentidadeParticipante { id: string; tenantId: string | null; }

/// Login: CPF + senha. Rate-limit por HMAC(CPF) + IP (fail-closed). Compara
/// sempre (dummy quando falta conta/senha). LEGACY_NO_PASSWORD -> falha
/// (fail-closed, vai para recuperacao assistida).
export async function autenticarParticipantePorSenha(entrada: {
  cpf: string; senha: string; ip?: string | null;
}): Promise<IdentidadeParticipante | null> {
  const chaves = [chaveDeAuth("PARTICIPANT_PASSWORD_ATTEMPT", "cpf", entrada.cpf)];
  if (entrada.ip) chaves.push(chaveDeAuth("PARTICIPANT_PASSWORD_ATTEMPT", "ip", entrada.ip));
  if (!(await permitido(chaves)).permitido) return null;

  const user = await prisma.user.findUnique({
    where: { cpf: entrada.cpf },
    select: { id: true, tenantId: true, passwordHash: true, role: true },
  });
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const confere = await bcrypt.compare(entrada.senha, hash);

  if (!user || !user.passwordHash || !confere) {
    await registrar("PARTICIPANT_PASSWORD_ATTEMPT", chaves);
    return null; // neutro: CPF inexistente e senha errada sao indistinguiveis
  }
  await limpar(chaves);
  return { id: user.id, tenantId: user.tenantId };
}

/// Cria o hash de uma senha nova (bcrypt cost 12). Nunca guarda plaintext.
export async function hashDeSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, BCRYPT_COST);
}

/// Prova de acao critica por SENHA (§19/§20). Verifica a senha e emite um
/// desafio CRITICAL_ACTION single-use (codigo gerado no servidor, devolvido ao
/// mesmo fluxo; NAO enviado a lugar nenhum). A action consome via verificarDesafio.
export async function emitirProvaDeAcaoCritica(entrada: {
  userId: string; senha: string;
}): Promise<{ challengeId: string; prova: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: entrada.userId }, select: { passwordHash: true } });
  const confere = await bcrypt.compare(entrada.senha, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !confere) return null;
  const prova = randomBytes(24).toString("base64url");
  const ch = await prisma.authChallenge.create({
    data: {
      userId: entrada.userId, purpose: "CRITICAL_ACTION",
      destinationHash: hmac(`senha:${entrada.userId}`),
      codeHash: hmac(prova),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), maxAttempts: 3,
    },
    select: { id: true },
  });
  return { challengeId: ch.id, prova };
}

/// Consome a prova (single-use, bound a user/purpose). Usado pelas actions
/// criticas do participante.
export async function consumirProvaDeAcaoCritica(entrada: { userId: string; challengeId: string; prova: string }): Promise<boolean> {
  const r = await verificarDesafio({ challengeId: entrada.challengeId, codigo: entrada.prova, purpose: "CRITICAL_ACTION", userId: entrada.userId });
  return r.resultado === "VERIFICADO";
}
