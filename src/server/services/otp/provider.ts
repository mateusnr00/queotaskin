// Abstração de entrega do OTP. A autenticação NUNCA fala direto com WhatsApp:
// fala com esta interface. Em produção um adaptador real (WhatsApp/SMS/email);
// nos testes o FakeOtpProvider, que só guarda o último código em memória e
// não envia nada para fora.
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
  throw new Error(
    "OTP delivery provider não configurado: integração real (WhatsApp/SMS/email) é etapa seguinte do P1-A",
  );
}
