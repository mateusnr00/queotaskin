-- Drop a unique constraint que estava deduplicando eventos diferentes
-- da MESMA transação (created, paid, expired, etc). Causava: a SyncPay
-- dispara o evento de "criada" 2s depois do reserve, depois dispara o
-- "paga" quando o cliente paga. A constraint só deixava o primeiro
-- entrar — o "paga" caía em P2002 e era ignorado, e a reserva ficava
-- eternamente PENDING.
--
-- Originalmente foi criada como UNIQUE INDEX (não CONSTRAINT), então
-- usamos DROP INDEX. IF EXISTS pra ser idempotente caso roll-back
-- parcial tenha removido em ambiente intermediário.

DROP INDEX IF EXISTS "PaymentWebhookEvent_provider_externalId_key";

CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_provider_externalId_idx"
  ON "PaymentWebhookEvent"("provider", "externalId");
