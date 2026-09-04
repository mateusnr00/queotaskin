// P1-C 7.1 KEY - separacao de dominio da chave do TOTP admin.
import { describe, expect, it } from "vitest";

import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { cifrarSegredoMfa, decifrarSegredoMfa, ehFormatoV2 } from "@/lib/auth/mfa-crypto";
import { coletarProblemasDeProducao } from "@/lib/env-validation";

const temChaves = Boolean(process.env.ADMIN_MFA_ENCRYPTION_KEY && process.env.PAYMENT_SECRET_ENCRYPTION_KEY);

(temChaves ? describe : describe.skip)("P1-C 7.1 · separacao de chave MFA vs pagamento", () => {
  it("KEY-1 MFA usa ADMIN_MFA_ENCRYPTION_KEY (v2); chave de pagamento nao decifra", () => {
    const blob = cifrarSegredoMfa("JBSWY3DPEHPK3PXP");
    expect(ehFormatoV2(blob)).toBe(true);
    expect(decifrarSegredoMfa(blob)).toBe("JBSWY3DPEHPK3PXP");
    // decifrar com a chave de PAGAMENTO (removendo o prefixo) NAO deve dar o texto
    expect(() => decryptSecret(blob.slice(3))).toThrow(); // GCM auth falha (chave errada)
  });

  it("KEY-2 gateway continua na PAYMENT_SECRET_ENCRYPTION_KEY", () => {
    const blob = encryptSecret("gateway-secret");
    expect(ehFormatoV2(blob)).toBe(false); // sem prefixo v2
    expect(decryptSecret(blob)).toBe("gateway-secret");
  });

  it("KEY-4 ciphertext legado (v1/chave de pagamento) e lido e re-cifravel para v2", () => {
    const legado = encryptSecret("SEGREDO_TOTP_ANTIGO"); // cifrado com a chave de pagamento, sem prefixo
    // decifrarSegredoMfa reconhece o legado e le com a chave de pagamento
    expect(decifrarSegredoMfa(legado)).toBe("SEGREDO_TOTP_ANTIGO");
    // re-cifra para v2 (chave MFA)
    const v2 = cifrarSegredoMfa(decifrarSegredoMfa(legado));
    expect(ehFormatoV2(v2)).toBe(true);
    expect(decifrarSegredoMfa(v2)).toBe("SEGREDO_TOTP_ANTIGO");
  });

  it("KEY-5 nem o blob cifrado nem o processo expoem o plaintext", () => {
    const blob = cifrarSegredoMfa("PLAINTEXT_SENSIVEL");
    expect(blob).not.toContain("PLAINTEXT_SENSIVEL");
  });
});

describe("KEY-3 producao exige ADMIN_MFA_ENCRYPTION_KEY (sem fallback)", () => {
  const base = {
    NODE_ENV: "production",
    AUTH_SECRET: "x".repeat(40),
    PAYMENT_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    DATABASE_URL: "postgresql://a@h/d",
    DIRECT_URL: "postgresql://m@h/d",
  } as unknown as NodeJS.ProcessEnv;

  it("sem a chave MFA em prod = problema (fail-fast)", () => {
    const p = coletarProblemasDeProducao(base);
    expect(p.some((x) => x.variavel === "ADMIN_MFA_ENCRYPTION_KEY")).toBe(true);
  });
  it("chave MFA igual a de pagamento e rejeitada (dominio separado)", () => {
    const p = coletarProblemasDeProducao({ ...base, ADMIN_MFA_ENCRYPTION_KEY: base.PAYMENT_SECRET_ENCRYPTION_KEY } as NodeJS.ProcessEnv);
    expect(p.some((x) => x.variavel === "ADMIN_MFA_ENCRYPTION_KEY" && /diferente/.test(x.problema))).toBe(true);
  });
  it("com chave MFA distinta e valida, sem problema", () => {
    const p = coletarProblemasDeProducao({ ...base, ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64") } as NodeJS.ProcessEnv);
    expect(p).toHaveLength(0);
  });
});
