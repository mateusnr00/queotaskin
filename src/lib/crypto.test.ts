import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

import { decryptSecret, encryptSecret } from "@/lib/crypto";

const PREV = process.env.PAYMENT_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.PAYMENT_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  process.env.PAYMENT_SECRET_ENCRYPTION_KEY = PREV;
});

describe("crypto", () => {
  it("encrypt → decrypt volta o texto original", () => {
    const plain = "JgLJuiwtR4@Ux"; // exemplo do formato CodePay
    const ct = encryptSecret(plain);
    expect(ct).not.toContain(plain);
    expect(decryptSecret(ct)).toBe(plain);
  });

  it("ciphertext é não-determinístico (IV aleatório)", () => {
    const ct1 = encryptSecret("mesmo segredo");
    const ct2 = encryptSecret("mesmo segredo");
    expect(ct1).not.toBe(ct2);
  });

  it("detecta tampering no ciphertext", () => {
    const ct = encryptSecret("secret");
    // Flipa um byte no meio do payload → deve falhar a verificação do auth tag.
    const buf = Buffer.from(ct, "base64");
    buf[Math.floor(buf.length / 2)] = buf[Math.floor(buf.length / 2)]! ^ 0xff;
    const tampered = buf.toString("base64");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejeita key inválida", () => {
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = "tooshort";
    expect(() => encryptSecret("x")).toThrow(/tamanho inválido/);
  });

  it("aceita key em hex (64 chars) também", () => {
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    const ct = encryptSecret("ok");
    expect(decryptSecret(ct)).toBe("ok");
  });
});
