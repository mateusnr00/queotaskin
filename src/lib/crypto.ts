// Encriptação simétrica AES-256-GCM pra secrets de gateway no banco.
//
// Por que GCM: dá autenticidade junto com confidencialidade — se alguém
// trocar um byte do ciphertext em trânsito (ou na coluna), o decrypt
// detecta e lança em vez de retornar lixo.
//
// Chave mestra: lida de PAYMENT_SECRET_ENCRYPTION_KEY (32 bytes em base64
// ou hex). Gera com:
//   node -e 'console.log(crypto.randomBytes(32).toString("base64"))'
// e cola na env var do Vercel.
//
// Formato do ciphertext (string base64):
//   [12 bytes IV][N bytes ciphertext][16 bytes tag]
// Tudo concatenado, em UMA string base64 — fica curto na coluna e facilita
// query/log sem ter que parsear JSON.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function loadKey(): Buffer {
  const raw = process.env.PAYMENT_SECRET_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "PAYMENT_SECRET_ENCRYPTION_KEY não definida. Gere com `node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"base64\"))'` e cole no Vercel."
    );
  }
  // Aceita base64 OU hex; o tamanho final precisa ser 32 bytes.
  let key: Buffer;
  if (/^[0-9a-f]+$/i.test(raw) && raw.length === KEY_LEN * 2) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== KEY_LEN) {
    throw new Error(
      `PAYMENT_SECRET_ENCRYPTION_KEY com tamanho inválido (${key.length} bytes; precisa de 32)`
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const key = loadKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("ciphertext corrompido (curto demais)");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.PAYMENT_SECRET_ENCRYPTION_KEY);
}
