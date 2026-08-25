-- Permite override por sorteio do gateway de pagamento. NULL = herda o
-- padrão do tenant. Credenciais continuam armazenadas no Tenant — o sorteio
-- só escolhe qual provider usar.

ALTER TABLE "Raffle"
  ADD COLUMN "paymentProvider" "PaymentProvider";
