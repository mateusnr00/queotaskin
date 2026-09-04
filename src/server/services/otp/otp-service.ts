// OtpService - geração e validação central de OTP. Nada de gerar/validar
// código espalhado pelo código. Propriedades garantidas:
//   - código por CSPRNG, 6 dígitos, guardado só como HMAC (§10/§11);
//   - expiração curta e explícita (5 min, §12);
//   - uso único por compare-and-set (§13/§39);
//   - limite de tentativas por desafio (5, §14);
//   - binding de tenant/user/purpose/challenge (§35-38);
//   - reenvio invalida o desafio anterior (§40).
import { prisma } from "@/lib/db";
import { destinoCanonico, gerarCodigoOtp, hmac, hmacConfere } from "@/lib/auth/cripto";
import type { DestinoDeEntrega, OtpDeliveryProvider } from "@/server/services/otp/provider";

export type PropositoDeOtp = "LOGIN" | "REGISTER_PHONE" | "CHANGE_PHONE" | "RECOVERY" | "CRITICAL_ACTION";

/// Expiração do OTP. Curta de propósito: janela grande é janela de brute force
/// e de replay. 5 minutos cobre o tempo real de receber e digitar.
export const OTP_EXPIRA_EM_MS = 5 * 60 * 1000;
export const OTP_MAX_TENTATIVAS = 5;

export interface DadosDoDesafio {
  tenantId?: string | null;
  userId?: string | null;
  purpose: PropositoDeOtp;
  destino: DestinoDeEntrega;
}

export interface DesafioCriado {
  challengeId: string;
  expiraEm: Date;
}

/// Cria um desafio: gera código, invalida desafios anteriores do mesmo
/// (purpose + destino + user), grava só HMACs, entrega pelo provider.
export async function criarDesafio(
  dados: DadosDoDesafio,
  provider: OtpDeliveryProvider,
): Promise<DesafioCriado> {
  const destinationHash = hmac(destinoCanonico(dados.destino.phoneCountry, dados.destino.phoneDigits));

  // §40 resend invalidation: consome (marca) desafios abertos equivalentes.
  await prisma.authChallenge.updateMany({
    where: {
      purpose: dados.purpose,
      destinationHash,
      userId: dados.userId ?? null,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });

  const codigo = gerarCodigoOtp();
  const expiraEm = new Date(Date.now() + OTP_EXPIRA_EM_MS);
  const challenge = await prisma.authChallenge.create({
    data: {
      tenantId: dados.tenantId ?? null,
      userId: dados.userId ?? null,
      purpose: dados.purpose,
      destinationHash,
      codeHash: hmac(codigo),
      expiresAt: expiraEm,
      maxAttempts: OTP_MAX_TENTATIVAS,
    },
    select: { id: true },
  });

  // Só agora o código sai - para o provider, nunca para o banco/logs.
  await provider.enviar(dados.destino, codigo, { purpose: dados.purpose });

  return { challengeId: challenge.id, expiraEm };
}

export type ResultadoDaVerificacaoOtp =
  | "VERIFICADO"
  | "CODIGO_INCORRETO"
  | "EXPIRADO"
  | "JA_CONSUMIDO"
  | "TENTATIVAS_ESGOTADAS"
  | "BINDING_INVALIDO"
  | "DESAFIO_INEXISTENTE";

export interface Esperado {
  challengeId: string;
  codigo: string;
  purpose: PropositoDeOtp;
  tenantId?: string | null;
  userId?: string | null;
}

export interface RetornoVerificacao {
  resultado: ResultadoDaVerificacaoOtp;
  userId?: string | null;
  tenantId?: string | null;
}

/// Verifica e (no acerto) consome o desafio, de forma atômica: dois requests
/// simultâneos com o código certo, só um vence (compare-and-set em consumedAt).
export async function verificarDesafio(esperado: Esperado): Promise<RetornoVerificacao> {
  const ch = await prisma.authChallenge.findUnique({ where: { id: esperado.challengeId } });
  if (!ch) return { resultado: "DESAFIO_INEXISTENTE" };

  // §35/§36/§37 binding: purpose, tenant e user têm de bater com o desafio.
  if (
    ch.purpose !== esperado.purpose ||
    (ch.tenantId ?? null) !== (esperado.tenantId ?? null) ||
    (ch.userId ?? null) !== (esperado.userId ?? null)
  ) {
    return { resultado: "BINDING_INVALIDO" };
  }
  if (ch.consumedAt) return { resultado: "JA_CONSUMIDO" };
  if (ch.expiresAt.getTime() <= Date.now()) return { resultado: "EXPIRADO" };
  if (ch.attemptCount >= ch.maxAttempts) return { resultado: "TENTATIVAS_ESGOTADAS" };

  const acerto = hmacConfere(ch.codeHash, hmac(esperado.codigo));

  if (!acerto) {
    // Conta a tentativa (compare-and-set defensivo pelo attemptCount lido).
    await prisma.authChallenge.updateMany({
      where: { id: ch.id, attemptCount: ch.attemptCount },
      data: { attemptCount: ch.attemptCount + 1, lastAttemptAt: new Date() },
    });
    const restam = ch.maxAttempts - (ch.attemptCount + 1);
    return { resultado: restam <= 0 ? "TENTATIVAS_ESGOTADAS" : "CODIGO_INCORRETO" };
  }

  // Acerto: consome ATÔMICO. Só a linha ainda não consumida é reivindicada.
  const consumo = await prisma.authChallenge.updateMany({
    where: { id: ch.id, consumedAt: null },
    data: { consumedAt: new Date(), lastAttemptAt: new Date() },
  });
  if (consumo.count === 0) return { resultado: "JA_CONSUMIDO" }; // perdeu a corrida
  return { resultado: "VERIFICADO", userId: ch.userId, tenantId: ch.tenantId };
}
