"use server";

// Conclusão de recuperação de legado pelo PRÓPRIO participante (§3). O grant
// (emitido pelo suporte) chega por capability URL. Resposta neutra para
// grant inválido/expirado/consumido/case rejeitado (§5). Nunca usa CPF/nome/
// telefone histórico como prova; a prova é o OTP no NOVO telefone.
import { headers } from "next/headers";

import { ipDaRequisicao } from "@/server/services/login-throttle";
import { onlyDigits } from "@/lib/cpf";
import {
  solicitarOtpDeRecuperacao,
  concluirRecuperacao,
} from "@/server/services/otp/recuperacao";
import { provedorDeOtp } from "@/server/services/otp/provider";
import type { ActionResult } from "@/server/actions/auth";

const MSG_NEUTRA = "Link de recuperação inválido ou expirado.";

export async function solicitarOtpDeRecuperacaoAction(
  raw: unknown,
): Promise<ActionResult<{ challengeId: string }>> {
  const r = raw as { caseId?: unknown; grant?: unknown; phone?: unknown; phoneCountry?: unknown };
  const caseId = typeof r?.caseId === "string" ? r.caseId : "";
  const grant = typeof r?.grant === "string" ? r.grant : "";
  const phone = onlyDigits(String(r?.phone ?? ""));
  const phoneCountry = String(r?.phoneCountry ?? "BR");
  void (await headers()); // garante contexto de request
  if (!caseId || !grant || phone.length < 6) return { ok: false, error: MSG_NEUTRA };
  try {
    const out = await solicitarOtpDeRecuperacao({ caseId, grant, novoPhone: phone, novoPhoneCountry: phoneCountry }, provedorDeOtp());
    if (!out.ok) return { ok: false, error: MSG_NEUTRA }; // grant inválido/expirado/consumido
    return { ok: true, data: { challengeId: out.challengeId } };
  } catch {
    return { ok: false, error: "Envio de código indisponível no momento." };
  }
}

export async function concluirRecuperacaoAction(
  raw: unknown,
): Promise<ActionResult> {
  const r = raw as { caseId?: unknown; grant?: unknown; challengeId?: unknown; codigo?: unknown; phone?: unknown; phoneCountry?: unknown };
  const caseId = typeof r?.caseId === "string" ? r.caseId : "";
  const grant = typeof r?.grant === "string" ? r.grant : "";
  const challengeId = typeof r?.challengeId === "string" ? r.challengeId : "";
  const codigo = typeof r?.codigo === "string" ? r.codigo : "";
  const phone = onlyDigits(String(r?.phone ?? ""));
  const phoneCountry = String(r?.phoneCountry ?? "BR");
  void ipDaRequisicao(await headers());
  if (!caseId || !grant || !challengeId || !/^[0-9]{6}$/.test(codigo) || phone.length < 6) {
    return { ok: false, error: "Dados inválidos" };
  }
  const out = await concluirRecuperacao({ caseId, grant, challengeId, codigo, novoPhone: phone, novoPhoneCountry: phoneCountry });
  if (out.ok) return { ok: true, data: undefined };
  // Neutro: não distingue grant vs OTP em detalhe que permita enumeração.
  const msg = out.motivo === "OTP_INVALIDO" ? "Código incorreto ou expirado." : MSG_NEUTRA;
  return { ok: false, error: msg };
}
