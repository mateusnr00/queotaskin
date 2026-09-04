// TOTP RFC 6238 para MFA de admin. Usa HMAC-SHA1 do node (a primitiva do
// padrao), nao cripto caseira. Independe de SMS/WhatsApp e do provider de OTP
// do participante: funciona offline, por app autenticador.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DIGITS = 6;
const STEP_SEGUNDOS = 30;
/// Tolerancia de clock skew: +/-1 step (§45). Nao aumentar.
export const JANELA_STEPS = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// Segredo TOTP por CSPRNG (20 bytes = 160 bits), em base32 (padrao dos apps).
export function gerarSegredoTotp(): string {
  const buf = randomBytes(20);
  let bits = "", out = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  const limpo = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const c of limpo) {
    const v = BASE32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function stepAtual(agoraMs: number = Date.now()): number {
  return Math.floor(agoraMs / 1000 / STEP_SEGUNDOS);
}

/// Codigo TOTP para um step (usado nos testes e no verificador).
export function codigoNoStep(segredoBase32: string, step: number): string {
  const key = base32Decode(segredoBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(step));
  const h = createHmac("sha1", key).update(buf).digest();
  const off = h[h.length - 1]! & 0x0f;
  const bin = ((h[off]! & 0x7f) << 24) | ((h[off + 1]! & 0xff) << 16) | ((h[off + 2]! & 0xff) << 8) | (h[off + 3]! & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export interface ResultadoTotp {
  ok: boolean;
  step?: number; // step que casou (para gravar lastUsedStep e barrar replay)
}

/// Verifica um codigo na janela +/-JANELA_STEPS. Se `ultimoStep` for passado,
/// recusa steps <= ele (anti-replay do mesmo timestep, §44). Comparacao
/// timing-safe.
export function verificarTotp(
  segredoBase32: string,
  codigo: string,
  opcoes: { agoraMs?: number; ultimoStep?: number | null } = {},
): ResultadoTotp {
  if (!/^[0-9]{6}$/.test(codigo)) return { ok: false };
  const atual = stepAtual(opcoes.agoraMs);
  for (let d = -JANELA_STEPS; d <= JANELA_STEPS; d++) {
    const step = atual + d;
    if (opcoes.ultimoStep != null && step <= opcoes.ultimoStep) continue; // replay
    const esperado = codigoNoStep(segredoBase32, step);
    const a = Buffer.from(codigo), b = Buffer.from(esperado);
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, step };
  }
  return { ok: false };
}

/// otpauth URI para o QR (nunca logar). issuer/label identificam a conta.
export function otpauthUri(segredoBase32: string, issuer: string, conta: string): string {
  const label = encodeURIComponent(`${issuer}:${conta}`);
  const params = new URLSearchParams({ secret: segredoBase32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SEGUNDOS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
