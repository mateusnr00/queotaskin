// Cifra dos secrets TOTP de admin com chave de DOMINIO SEPARADO
// (ADMIN_MFA_ENCRYPTION_KEY), distinta da chave dos gateways financeiros
// (PAYMENT_SECRET_ENCRYPTION_KEY). Reduz o blast radius (§18/§19).
//
// Rollout (§20): novos secrets escrevem "v2:<base64>" (chave MFA). Secrets
// legados (sem prefixo) foram cifrados com a chave de pagamento e sao lidos com
// ela durante a migracao controlada. NUNCA escrevemos com a chave de pagamento.
//
// Fail-closed (§22): em producao, sem ADMIN_MFA_ENCRYPTION_KEY nao ha fallback
// silencioso para a chave de pagamento (env-validation derruba o boot).
import { cifrarComChave, decifrarComChave, loadKeyFrom } from "@/lib/crypto";

const PREFIXO_V2 = "v2:";

function chaveMfa(): Buffer {
  return loadKeyFrom("ADMIN_MFA_ENCRYPTION_KEY");
}

export function cifrarSegredoMfa(plaintext: string): string {
  return PREFIXO_V2 + cifrarComChave(chaveMfa(), plaintext);
}

export function decifrarSegredoMfa(blob: string): string {
  if (blob.startsWith(PREFIXO_V2)) {
    return decifrarComChave(chaveMfa(), blob.slice(PREFIXO_V2.length));
  }
  // Legado (v1): cifrado com a chave de pagamento. Leitura durante migracao.
  return decifrarComChave(loadKeyFrom("PAYMENT_SECRET_ENCRYPTION_KEY"), blob);
}

/// Um secret esta no formato novo (v2, chave MFA)?
export function ehFormatoV2(blob: string): boolean {
  return blob.startsWith(PREFIXO_V2);
}
