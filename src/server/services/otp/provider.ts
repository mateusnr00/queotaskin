// Abstração de entrega do OTP. A autenticação NUNCA fala direto com WhatsApp:
// fala com esta interface. Em produção um adaptador real (WhatsApp/SMS/email);
// nos testes o FakeOtpProvider, que só guarda o último código em memória e
// não envia nada para fora.
import { resolverProviderDeOtp } from "@/server/services/otp/provider-registry";

export interface DestinoDeEntrega {
  phoneCountry: string;
  phoneDigits: string;
}

export interface OtpDeliveryProvider {
  readonly nome: string;
  enviar(destino: DestinoDeEntrega, codigo: string, contexto: { purpose: string }): Promise<void>;
}

/// Provider de teste: registra o que "enviaria" sem tocar em rede. Permite ao
/// teste ler o código para simular o usuário digitando - jamais existe em
/// produção.
export class FakeOtpProvider implements OtpDeliveryProvider {
  readonly nome = "FAKE";
  readonly enviados: { destino: DestinoDeEntrega; codigo: string; purpose: string }[] = [];
  async enviar(destino: DestinoDeEntrega, codigo: string, contexto: { purpose: string }): Promise<void> {
    this.enviados.push({ destino, codigo, purpose: contexto.purpose });
  }
  ultimoCodigo(): string | undefined {
    return this.enviados.at(-1)?.codigo;
  }
}

/// Fábrica do provider de entrega em runtime. Ainda NÃO há adaptador real
/// (WhatsApp/SMS/email) - esta fase entrega a arquitetura e os testes. Em
/// produção, sem provider configurado, falha fechado: não existe caminho que
/// "envie" sem um canal real. Os testes injetam o FakeOtpProvider direto nos
/// serviços, sem passar por aqui.
export function provedorDeOtp(): OtpDeliveryProvider {
  // Delega ao registry (seleção por OTP_PROVIDER, fail-closed). Ciclo ESM
  // resolvido em call-time (resolverProviderDeOtp só é chamada aqui, no runtime).
  return resolverProviderDeOtp();
}

/// Mock determinístico para testes (igual ao Fake, nome distinto). Sem rede.
export class MockOtpProvider extends FakeOtpProvider {}

/// baseUrl de provider de OTP: HTTPS obrigatória; sem localhost em produção;
/// allowlist de hosts oficiais (vazia enquanto nenhum vendor é escolhido).
const HOSTS_OTP_PERMITIDOS = new Set<string>([
  // adicionar o host oficial do vendor quando escolhido, ex.: "api.vendor.com"
]);
export function baseUrlDeOtpConfiavel(url: string | undefined, ehProd: boolean): boolean {
  if (!url) return !ehProd; // sem baseUrl: ok fora de prod
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (ehProd && (u.hostname === "localhost" || u.hostname.startsWith("127."))) return false;
  if (ehProd && HOSTS_OTP_PERMITIDOS.size > 0) return HOSTS_OTP_PERMITIDOS.has(u.hostname);
  // Em prod, sem allowlist populada (vendor não escolhido), nenhuma baseUrl passa.
  return !ehProd;
}
