// TIER DE SEGURANÇA DE CADA GATEWAY. Explícito, para o sistema nunca tratar
// um provider fraco como equivalente ao forte.
//
//   STRONG      = identidade + status + VALOR verificados server-to-server.
//   STATUS_ONLY = status verificado, valor ainda não (doc oficial pendente).
//
// Não é enforcement de "alto valor" (isso é decisão comercial/config). É a
// classificação que torna a diferença observável e auditável, e a base para
// impedir, operacionalmente, que um STATUS_ONLY seja usado onde se exige forte.

export type TierDeSeguranca = "STRONG" | "STATUS_ONLY" | "DISABLED";

const TIER: Record<string, TierDeSeguranca> = {
  NEXUSPAG: "STRONG",
  HORSEPAY: "STATUS_ONLY",
  SYNCPAY: "STATUS_ONLY",
  SIGILOPAY: "STATUS_ONLY",
};

export function tierDoProvider(provider: string): TierDeSeguranca {
  return TIER[provider.toUpperCase()] ?? "DISABLED";
}

// KILL SWITCH DE APROVAÇÃO AUTOMÁTICA (fail-closed).
//
// Ligado (PAYMENTS_AUTO_APPROVAL_DISABLED=true), NENHUM caminho automático
// aprova: os pagamentos ficam PENDING e são resolvidos por reconciliação
// manual. É a forma SEGURA de estancar um incidente, sem voltar para código
// vulnerável. Nunca vira "comportamento legado" nem fallback fraco.
export function aprovacaoAutomaticaDesligada(): boolean {
  return process.env.PAYMENTS_AUTO_APPROVAL_DISABLED === "true";
}
