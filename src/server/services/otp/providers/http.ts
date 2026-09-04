// Adapter HTTP GENERICO para providers de OTP S2S (§3/§5/§6/§7). Estrutura
// completa: timeout explicito, mapeamento de erro para enum interno, redacao,
// baseUrl allowlist/HTTPS. O CORPO especifico do vendor (endpoint + JSON) e o
// unico ponto que depende de escolha de vendor: sem vendor selecionado, falha
// fechado (nao inventamos API). Quando um vendor for escolhido, implemente
// `montarRequisicao` para ele.
import type { DestinoDeEntrega, OtpDeliveryProvider } from "@/server/services/otp/provider";
import { ErroDeProvider } from "@/server/services/otp/providers/tipos";

const TIMEOUT_MS = 8000;

export interface ConfigHttpProvider {
  nome: string;
  baseUrl: string; // ja validada (HTTPS, allowlist) por quem constroi
  apiKey: string;
  /** Monta a requisicao especifica do vendor. Sem vendor => lanca. */
  montarRequisicao?: (destino: DestinoDeEntrega, codigo: string, ctx: { purpose: string }) => { url: string; init: RequestInit };
}

export class HttpOtpProvider implements OtpDeliveryProvider {
  readonly nome: string;
  constructor(private readonly cfg: ConfigHttpProvider) {
    this.nome = cfg.nome;
  }

  async enviar(destino: DestinoDeEntrega, codigo: string, contexto: { purpose: string }): Promise<void> {
    if (!this.cfg.montarRequisicao) {
      // Arquitetura pronta, vendor nao selecionado: fail-closed.
      throw new ErroDeProvider("PERMANENT_FAILURE", "vendor de OTP nao selecionado");
    }
    const { url, init } = this.cfg.montarRequisicao(destino, codigo, contexto);
    let resp: Response;
    try {
      resp = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
    } catch (e) {
      // timeout ou rede: falha transitoria (quem chama trata como fail-closed).
      const nome = (e as Error).name;
      throw new ErroDeProvider(nome === "TimeoutError" ? "TIMEOUT" : "TEMPORARY_FAILURE");
      // NUNCA loga codigo/telefone/response body aqui.
    }
    if (resp.status === 429) throw new ErroDeProvider("RATE_LIMITED");
    if (resp.status >= 500) throw new ErroDeProvider("TEMPORARY_FAILURE");
    if (resp.status >= 400) throw new ErroDeProvider("PERMANENT_FAILURE");
    // 2xx = aceito pelo provider. "delivered" (se houver) e telemetria, nao
    // prova de identidade (§9). A prova continua sendo o usuario digitar o OTP.
  }
}
