// Contrato de resultado de entrega do OTP (P1-C 10 §5). O dominio nunca ve o
// erro cru do vendor: mapeamos para este enum interno.
export type DesfechoDeEntrega =
  | "SUCCESS"
  | "TIMEOUT"
  | "TEMPORARY_FAILURE"
  | "PERMANENT_FAILURE"
  | "RATE_LIMITED";

export class ErroDeProvider extends Error {
  constructor(public readonly desfecho: DesfechoDeEntrega, mensagem?: string) {
    super(mensagem ?? desfecho);
    this.name = "ErroDeProvider";
  }
}
