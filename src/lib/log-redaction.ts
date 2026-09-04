// Redação central para logs estruturados (P1-C §22). Nunca logar CPF, telefone,
// OTP, TOTP, JWT, cookie, secret de gateway, payload PIX sensível, Steam URL,
// DB URL. Use redigir() antes de console.* quando o objeto puder conter isso.
const CHAVES_SENSIVEIS = /(cpf|phone|telefone|otp|totp|codigo|code|token|secret|password|senha|authorization|cookie|jwt|session|steamtradeurl|steam_url|databaseurl|database_url|pixcode|copiaecola|apikey|api_key)/i;

export function redigir(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6 || valor == null) return valor;
  if (typeof valor === "string") return valor.length > 200 ? valor.slice(0, 8) + "…[REDIGIDO]" : valor;
  if (Array.isArray(valor)) return valor.map((v) => redigir(v, profundidade + 1));
  if (typeof valor === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = CHAVES_SENSIVEIS.test(k) ? "[REDIGIDO]" : redigir(v, profundidade + 1);
    }
    return out;
  }
  return valor;
}
