-- ============================================================================
-- FINANCIAL MAINTENANCE GUARD  (FASE 4.10)
-- ----------------------------------------------------------------------------
-- Defesa ABAIXO da aplicacao: durante a janela de deploy, NENHUM codigo (OLD
-- vulneravel, NEW, webhook, polling, worker) consegue gravar a aprovacao
-- financeira. O PostgreSQL recusa a transicao, o pagamento fica PENDING e e
-- recuperavel depois. Independe de env var da app: o estado vive no banco.
--
-- Compativel com o schema OLD (so cria tabelas novas e triggers sobre colunas
-- existentes Payment.status / Reservation.status). Instalavel com a app OLD no
-- ar, ANTES das migrations P0. Idempotente.
-- ============================================================================

-- Estado da manutencao: uma unica linha (id boolean PK = true).
CREATE TABLE IF NOT EXISTS "_financial_maintenance" (
  id         boolean     PRIMARY KEY DEFAULT true,
  enabled    boolean     NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT "_fin_maint_single_row" CHECK (id = true)
);
INSERT INTO "_financial_maintenance" (id, enabled, updated_by)
  VALUES (true, false, 'install')
  ON CONFLICT (id) DO NOTHING;

-- Evidencia operacional das ativacoes/desativacoes (sem segredo).
CREATE TABLE IF NOT EXISTS "_financial_maintenance_audit" (
  id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at     timestamptz NOT NULL DEFAULT now(),
  action text        NOT NULL,
  actor  text
);

-- FAIL-CLOSED: so enabled=false explicito PERMITE aprovacao. Linha ausente
-- (NULL) => bloqueia. Lookup de uma unica linha por PK: custo desprezivel.
CREATE OR REPLACE FUNCTION "_fin_maint_enabled"() RETURNS boolean
  LANGUAGE sql STABLE AS $fn$
    SELECT enabled FROM "_financial_maintenance" WHERE id = true
  $fn$;

-- Bloqueia SOMENTE a transicao para APPROVED (nao mexe em update de metadata
-- de Payment ja aprovado, nem em transicao para outros estados).
CREATE OR REPLACE FUNCTION "_fin_maint_block_payment_approval"() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF NEW.status = 'APPROVED'
       AND OLD.status IS DISTINCT FROM 'APPROVED'
       AND "_fin_maint_enabled"() IS NOT FALSE THEN
      RAISE EXCEPTION 'FINANCIAL_MAINTENANCE_ACTIVE: aprovacao de Payment bloqueada'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END;
  $fn$;

DROP TRIGGER IF EXISTS "prevent_payment_approval_during_financial_maintenance" ON "Payment";
CREATE TRIGGER "prevent_payment_approval_during_financial_maintenance"
  BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "_fin_maint_block_payment_approval"();

-- Cobre o override manual SEM Payment (grava Reservation PAID direto).
CREATE OR REPLACE FUNCTION "_fin_maint_block_reservation_paid"() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF NEW.status = 'PAID'
       AND OLD.status IS DISTINCT FROM 'PAID'
       AND "_fin_maint_enabled"() IS NOT FALSE THEN
      RAISE EXCEPTION 'FINANCIAL_MAINTENANCE_ACTIVE: Reservation PAID bloqueada'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END;
  $fn$;

DROP TRIGGER IF EXISTS "prevent_reservation_paid_during_financial_maintenance" ON "Reservation";
CREATE TRIGGER "prevent_reservation_paid_during_financial_maintenance"
  BEFORE UPDATE ON "Reservation"
  FOR EACH ROW EXECUTE FUNCTION "_fin_maint_block_reservation_paid"();
