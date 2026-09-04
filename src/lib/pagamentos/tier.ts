// TIER DE SEGURANÇA DE CADA GATEWAY. Explícito, para o sistema nunca tratar
// um provider fraco como equivalente ao forte.
//
//   STRONG      = identidade + status + VALOR verificados server-to-server.
//   STATUS_ONLY = status verificado, valor ainda não (doc oficial pendente).
//
// NÃO existe "threshold de alto valor" no sistema. A política é binária e por
// provider (ver aprovacaoAutomaticaPermitida): STRONG autoaprova; STATUS_ONLY
// não autoaprova em produção sem opt-in explícito; DISABLED nunca. Isso evita
// inventar um limiar comercial e evita o "metade seguro/metade vulnerável".

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


// POLÍTICA CENTRAL DE APROVAÇÃO AUTOMÁTICA, por provider (fail-closed).
//
// STRONG (valor conferido no gateway) pode autoaprovar. STATUS_ONLY confirma
// o status server-to-server mas NÃO confere o valor, então em produção não
// deve autoaprovar sozinho: o pagamento fica PENDING/reconciliável. Um
// operador que aceite o risco habilita explicitamente por env; o default é
// seguro. DISABLED nunca autoaprova. Superior a um "alto valor" não definido:
// é uma regra técnica clara, testável e sem número mágico.
export function aprovacaoAutomaticaPermitida(provider: string): boolean {
  const tier = tierDoProvider(provider);
  if (tier === "STRONG") return true;
  if (tier === "STATUS_ONLY") {
    // §30 (P1-B): em PRODUCAO, STATUS_ONLY autoaprovar e IMPOSSIVEL - nenhum
    // toggle de admin/env pode enfraquecer o invariante financeiro. O opt-in
    // so existe fora de producao (test/dev), para os testes de mecanismo.
    if (process.env.NODE_ENV === "production") return false;
    return process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL === "true";
  }
  return false;
}