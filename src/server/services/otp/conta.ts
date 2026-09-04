// Mudancas sensiveis de conta e classificacao de legado.
import { prisma } from "@/lib/db";
import { verificarDesafio } from "@/server/services/otp/otp-service";
import { revogarTodasAsSessoes } from "@/server/services/otp/sessao";
import { validarSessaoParticipante, type SessaoParticipante } from "@/server/services/otp/sessao-participante";

export type ClasseDeConta = "PHONE_VERIFIED" | "LEGACY_PHONE_UNVERIFIED" | "LEGACY_NO_PHONE";

/// Classificacao SO por estado tecnico. Nao infere confianca (§13).
export function classificarConta(u: { phone: string | null; phoneVerifiedAt: Date | null }): ClasseDeConta {
  if (u.phoneVerifiedAt && u.phone) return "PHONE_VERIFIED";
  if (u.phone) return "LEGACY_PHONE_UNVERIFIED";
  return "LEGACY_NO_PHONE";
}

export type ResultadoTrocaTelefone =
  | { ok: true; sessionVersion: number }
  | { ok: false; motivo: "SESSAO_INVALIDA" | "CODIGO_INVALIDO" | "TELEFONE_EM_USO" };

/// Troca de telefone de conta SEGURA (§21). Exige:
///   - sessao valida (userId autenticado);
///   - OTP verificado no NOVO telefone (challenge CHANGE_PHONE consumido);
/// e entao: grava o novo telefone + phoneVerifiedAt, e REVOGA as sessoes
/// antigas (a versao sobe). Nunca vira fator sem a prova do novo numero.
export async function trocarTelefoneVerificado(entrada: {
  sessao: SessaoParticipante;
  novoPhone: string;
  novoPhoneCountry: string;
  challengeIdDoNovoTelefone: string;
  codigo: string;
}): Promise<ResultadoTrocaTelefone> {
  // Sessao valida primeiro (§9): sem sessao autenticada, nada de trocar
  // telefone - informar CPF+novo telefone+OTP sem sessao seria A1 com passos.
  const sess = await validarSessaoParticipante(entrada.sessao);
  if (!sess.ok) return { ok: false, motivo: "SESSAO_INVALIDA" };
  const userId = sess.userId;
  // Reauth/prova do novo numero: o challenge tem de ser CHANGE_PHONE, deste
  // usuario, e conferir. verificarDesafio consome (uso unico).
  const verif = await verificarDesafio({
    challengeId: entrada.challengeIdDoNovoTelefone,
    codigo: entrada.codigo,
    purpose: "CHANGE_PHONE",
    userId,
  });
  if (verif.resultado !== "VERIFICADO") return { ok: false, motivo: "CODIGO_INVALIDO" };

  // O telefone novo nao pode pertencer a outra conta (respeita o unique).
  const emUso = await prisma.user.findFirst({
    where: { phone: entrada.novoPhone, id: { not: userId } },
    select: { id: true },
  });
  if (emUso) return { ok: false, motivo: "TELEFONE_EM_USO" };

  await prisma.user.update({
    where: { id: userId },
    data: {
      phone: entrada.novoPhone,
      phoneCountry: entrada.novoPhoneCountry,
      phoneVerifiedAt: new Date(),
    },
  });
  const versao = await revogarTodasAsSessoes(userId);
  return { ok: true, sessionVersion: versao };
}

/// Reauth generico para acao critica (Steam trade URL, etc., §26/§27). Exige
/// um OTP CRITICAL_ACTION deste usuario. Nao troca dado por si: quem chama so
/// prossegue se isto passar.
export async function provarAcaoCritica(entrada: {
  userId: string;
  challengeId: string;
  codigo: string;
}): Promise<boolean> {
  const verif = await verificarDesafio({
    challengeId: entrada.challengeId,
    codigo: entrada.codigo,
    purpose: "CRITICAL_ACTION",
    userId: entrada.userId,
  });
  return verif.resultado === "VERIFICADO";
}
