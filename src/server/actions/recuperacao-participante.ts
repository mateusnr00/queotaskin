"use server";

// Recuperacao de legado pelo participante (FASE 10.2): o grant (emitido pelo
// suporte) chega por capability URL. O usuario define uma NOVA SENHA. Sem OTP,
// sem telefone. Resposta neutra para grant invalido/expirado/consumido (§5).
import { concluirRecuperacaoComSenha } from "@/server/services/otp/recuperacao";
import type { ActionResult } from "@/server/actions/auth";

const MSG_NEUTRA = "Link de recuperacao invalido ou expirado.";

export async function redefinirSenhaPorRecuperacaoAction(
  raw: unknown,
): Promise<ActionResult> {
  const r = raw as { caseId?: unknown; grant?: unknown; novaSenha?: unknown; confirmarSenha?: unknown };
  const caseId = typeof r?.caseId === "string" ? r.caseId : "";
  const grant = typeof r?.grant === "string" ? r.grant : "";
  const novaSenha = typeof r?.novaSenha === "string" ? r.novaSenha : "";
  const confirmar = typeof r?.confirmarSenha === "string" ? r.confirmarSenha : "";
  if (!caseId || !grant) return { ok: false, error: MSG_NEUTRA };
  if (novaSenha.length < 8) return { ok: false, error: "A senha precisa de pelo menos 8 caracteres." };
  if (novaSenha !== confirmar) return { ok: false, error: "As senhas nao conferem." };

  const out = await concluirRecuperacaoComSenha({ caseId, grant, novaSenha });
  if (out.ok) return { ok: true, data: undefined };
  return { ok: false, error: MSG_NEUTRA }; // neutro (grant invalido/consumido/corrida)
}
