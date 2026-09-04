// Validacao central de ambiente de PRODUCAO (P1-C §5/§6). Fail-fast: producao
// nao sobe silenciosamente com invariante de seguranca ausente/perigoso.
// NUNCA inclui valores de secret nas mensagens - so nomes e o problema.

export interface ProblemaDeEnv {
  variavel: string;
  problema: string;
}

/// Roda as checagens e devolve a lista de problemas (vazia = ok). Nao lanca,
/// para ser testavel; validateProductionEnvironment lanca a partir disto.
export function coletarProblemasDeProducao(env: NodeJS.ProcessEnv = process.env): ProblemaDeEnv[] {
  const ehProd = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  if (!ehProd) return [];

  const p: ProblemaDeEnv[] = [];
  const exigir = (nome: string) => { if (!env[nome] || env[nome]!.length < 8) p.push({ variavel: nome, problema: "ausente ou curto demais em producao" }); };

  // Segredos criticos obrigatorios.
  exigir("AUTH_SECRET");
  exigir("PAYMENT_SECRET_ENCRYPTION_KEY");
  exigir("ADMIN_MFA_ENCRYPTION_KEY"); // §22 dominio separado do TOTP, sem fallback
  exigir("DATABASE_URL");
  exigir("DIRECT_URL");

  // Encryption key precisa ter 32 bytes (base64).
  const key = env.PAYMENT_SECRET_ENCRYPTION_KEY;
  if (key) {
    try {
      if (Buffer.from(key, "base64").length !== 32) p.push({ variavel: "PAYMENT_SECRET_ENCRYPTION_KEY", problema: "nao decodifica para 32 bytes" });
    } catch { p.push({ variavel: "PAYMENT_SECRET_ENCRYPTION_KEY", problema: "base64 invalido" }); }
  }

  const mfaKey = env.ADMIN_MFA_ENCRYPTION_KEY;
  if (mfaKey) {
    try { if (Buffer.from(mfaKey, "base64").length !== 32) p.push({ variavel: "ADMIN_MFA_ENCRYPTION_KEY", problema: "nao decodifica para 32 bytes" }); }
    catch { p.push({ variavel: "ADMIN_MFA_ENCRYPTION_KEY", problema: "base64 invalido" }); }
  }
  // A chave do MFA NAO pode ser igual a de pagamento (dominio separado).
  if (mfaKey && key && mfaKey === key) p.push({ variavel: "ADMIN_MFA_ENCRYPTION_KEY", problema: "deve ser diferente de PAYMENT_SECRET_ENCRYPTION_KEY (dominio separado)" });

  // OTP provider (§37/§62/§63): em producao, provider real obrigatorio, fake
  // proibido, api key obrigatoria, baseUrl HTTPS/allowlist se configurada.
  const otpProv = (env.OTP_PROVIDER ?? "").trim().toLowerCase();
  if (otpProv === "" ) p.push({ variavel: "OTP_PROVIDER", problema: "obrigatorio em producao (auth participante depende dele)" });
  else if (otpProv === "fake" || otpProv === "mock") p.push({ variavel: "OTP_PROVIDER", problema: "provider fake/mock proibido em producao" });
  else if (!env.OTP_PROVIDER_API_KEY) p.push({ variavel: "OTP_PROVIDER_API_KEY", problema: "obrigatoria quando OTP_PROVIDER esta setado" });
  if (env.OTP_PROVIDER_BASE_URL) {
    try {
      const u = new URL(env.OTP_PROVIDER_BASE_URL);
      if (u.protocol !== "https:") p.push({ variavel: "OTP_PROVIDER_BASE_URL", problema: "precisa ser HTTPS em producao" });
    } catch { p.push({ variavel: "OTP_PROVIDER_BASE_URL", problema: "URL invalida" }); }
  }
  // Nenhum segredo de OTP em NEXT_PUBLIC (checado no loop abaixo tambem).

  // Flags inseguras NAO podem estar ligadas em producao.
  if (env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL === "true") p.push({ variavel: "PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL", problema: "STATUS_ONLY autoaprovar e proibido em producao" });
  if (env.ALLOW_DESTRUCTIVE_TESTS === "true") p.push({ variavel: "ALLOW_DESTRUCTIVE_TESTS", problema: "barreira de teste destrutivo nao pode estar ligada em producao" });
  if (env.AUTH_DEBUG === "true" || env.NEXTAUTH_DEBUG === "true") p.push({ variavel: "AUTH_DEBUG", problema: "debug de auth nao pode estar ligado em producao" });

  // Nenhum segredo em NEXT_PUBLIC_*.
  for (const nome of Object.keys(env)) {
    if (nome.startsWith("NEXT_PUBLIC_") && /(SECRET|PASSWORD|PRIVATE|TOKEN|API_?KEY)/i.test(nome)) {
      p.push({ variavel: nome, problema: "segredo exposto ao cliente via NEXT_PUBLIC_" });
    }
  }

  return p;
}

/// Fail-fast. Lanca com a lista de problemas (sem valores) se houver.
export function validateProductionEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const problemas = coletarProblemasDeProducao(env);
  if (problemas.length > 0) {
    const linhas = problemas.map((x) => `  - ${x.variavel}: ${x.problema}`).join("\n");
    throw new Error(`Ambiente de producao invalido (P1-C):\n${linhas}`);
  }
}
