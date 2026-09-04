import { describe, expect, it } from "vitest";
import { codigoNoStep, verificarTotp, gerarSegredoTotp, stepAtual, otpauthUri } from "@/lib/auth/totp";

// Vetor RFC 6238 (SHA1): secret ASCII "12345678901234567890" = base32
// GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ. T=59 -> step 1 -> "94287082" (ultimos 6: 287082).
const RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP RFC 6238", () => {
  it("vetor oficial: step 1 => 287082; step 2 (T=1111111109) confere", () => {
    expect(codigoNoStep(RFC, 1)).toBe("287082");
    // T=1111111109 -> step 37037036 -> "07081804" -> 081804
    expect(codigoNoStep(RFC, Math.floor(1111111109 / 30))).toBe("081804");
  });
  it("round-trip: codigo do step atual verifica; janela +/-1", () => {
    const s = gerarSegredoTotp();
    const agoraMs = Date.now();
    const st = stepAtual(agoraMs);
    expect(verificarTotp(s, codigoNoStep(s, st), { agoraMs }).ok).toBe(true);
    expect(verificarTotp(s, codigoNoStep(s, st - 1), { agoraMs }).ok).toBe(true); // -1 step
    expect(verificarTotp(s, codigoNoStep(s, st + 1), { agoraMs }).ok).toBe(true); // +1 step
    expect(verificarTotp(s, codigoNoStep(s, st + 2), { agoraMs }).ok).toBe(false); // fora
  });
  it("§44 anti-replay: ultimoStep barra reuso do mesmo timestep", () => {
    const s = gerarSegredoTotp();
    const agoraMs = Date.now();
    const st = stepAtual(agoraMs);
    const r = verificarTotp(s, codigoNoStep(s, st), { agoraMs });
    expect(r.ok).toBe(true);
    // com ultimoStep = step usado, o mesmo codigo nao passa de novo
    expect(verificarTotp(s, codigoNoStep(s, st), { agoraMs, ultimoStep: r.step }).ok).toBe(false);
  });
  it("codigo malformado recusado; segredo tem entropia (base32 32 chars)", () => {
    expect(verificarTotp(RFC, "12345", {}).ok).toBe(false);
    expect(verificarTotp(RFC, "abcdef", {}).ok).toBe(false);
    expect(gerarSegredoTotp()).toMatch(/^[A-Z2-7]{32}$/);
  });
  it("otpauth URI nao vaza alem do necessario e traz o secret p/ enrollment", () => {
    const uri = otpauthUri("ABC", "QueOta", "admin@x.com");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=ABC");
  });
});
