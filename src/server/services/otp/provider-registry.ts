// Seleção do provider de OTP em runtime (§3/§4/§37/§62). Fail-closed:
//  - sem OTP_PROVIDER: erro (nenhum envio possível);
//  - fake/mock: só fora de produção;
//  - nome real: precisa de adapter registrado (nenhum enquanto o vendor não é
//    escolhido) -> desconhecido -> fail-closed.
import {
  FakeOtpProvider,
  MockOtpProvider,
  type OtpDeliveryProvider,
} from "@/server/services/otp/provider";
import { ErroDeProvider } from "@/server/services/otp/providers/tipos";

type Fabrica = () => OtpDeliveryProvider;

// Adapters reais registrados por nome. Vazio: nenhum vendor escolhido ainda.
// Quando escolher, registre aqui: REAIS["<vendor>"] = () => new HttpOtpProvider({...}).
const REAIS: Record<string, Fabrica> = {};

export function ehProducao(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function resolverProviderDeOtp(): OtpDeliveryProvider {
  const nome = (process.env.OTP_PROVIDER ?? "").trim().toLowerCase();
  const prod = ehProducao();

  if (nome === "") throw new ErroDeProvider("PERMANENT_FAILURE", "OTP_PROVIDER não configurado");
  if (nome === "fake" || nome === "mock") {
    if (prod) throw new ErroDeProvider("PERMANENT_FAILURE", "provider fake/mock proibido em produção");
    return nome === "mock" ? new MockOtpProvider() : new FakeOtpProvider();
  }
  const fab = REAIS[nome];
  if (!fab) throw new ErroDeProvider("PERMANENT_FAILURE", "OTP_PROVIDER desconhecido");
  return fab();
}
