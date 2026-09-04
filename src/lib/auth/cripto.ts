// Primitivas cripto da autenticação. Um lugar só, para o código de OTP e as
// chaves de rate-limit nunca usarem Math.random nem CPF/telefone em texto.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// Segredo dedicado do OTP. Fail-closed: sem segredo em produção, nada de
// gerar/validar código. Em teste/dev cai para um valor fixo local (nunca
// usado em produção porque exigimos a env fora de teste).
export function segredoDeAuth(): string {
  const s = process.env.AUTH_OTP_SECRET ?? process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_OTP_SECRET/AUTH_SECRET ausente ou curto em produção");
  }
  return "otp-secret-de-desenvolvimento-nao-use-em-producao";
}

/// HMAC-SHA256 em hex. Usado para codeHash, destinationHash e chaves de
/// rate-limit. Nunca use SHA simples de CPF: o espaço de CPF é enumerável e
/// sem segredo o hash é reversível por força bruta.
export function hmac(valor: string): string {
  return createHmac("sha256", segredoDeAuth()).update(valor).digest("hex");
}

/// Compara dois HMACs (hex) em tempo constante. Evita oráculo de temporização
/// na verificação do código.
export function hmacConfere(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/// Código OTP de 6 dígitos por CSPRNG (nunca Math.random). Zero à esquerda
/// preservado: "000123" é um código válido de seis dígitos.
export function gerarCodigoOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/// Canônico do telefone para hash/rate-limit: país + dígitos. Estável e sem
/// depender de formatação. Não é E.164 completo (o número é guardado sem o
/// código do país), mas é único por conta no modelo atual.
export function destinoCanonico(phoneCountry: string, phoneDigits: string): string {
  return `${phoneCountry.trim().toUpperCase()}|${phoneDigits.replace(/\D/g, "")}`;
}

/// Telefone mascarado para exibir sem revelar o número: mantém os 2 últimos
/// dígitos. "11987654321" -> "*********21".
export function mascararTelefone(phoneDigits: string): string {
  const d = phoneDigits.replace(/\D/g, "");
  if (d.length <= 2) return "*".repeat(d.length);
  return "*".repeat(d.length - 2) + d.slice(-2);
}
