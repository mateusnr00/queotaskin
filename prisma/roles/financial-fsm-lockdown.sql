-- P1-C 7.1: lockdown financeiro de producao. Aplicar DEPOIS de roles.sql e da
-- migration da funcao fin_transicao_pagamento, na MESMA janela do guard.
-- Torna impossivel para a app_runtime fabricar aprovacao via DML cru.

-- 1. app_runtime executa a funcao autoritativa (dona = migration_role).
GRANT EXECUTE ON FUNCTION "fin_transicao_pagamento"(text, text, boolean) TO app_runtime;

-- 2. Tira UPDATE(status) de Payment da app_runtime; re-concede as demais colunas.
REVOKE UPDATE ON "Payment" FROM app_runtime;
DO $$
DECLARE cols text := '';
BEGIN
  SELECT string_agg(format('%I', column_name), ',') INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='Payment' AND column_name <> 'status';
  EXECUTE format('GRANT UPDATE (%s) ON "Payment" TO app_runtime', cols);
END $$;

-- 3. INSERT de Payment sempre nasce PENDING (nao da para nascer APPROVED).
CREATE OR REPLACE FUNCTION "fin_payment_insert_pending"() RETURNS trigger
  LANGUAGE plpgsql AS $t$
BEGIN
  IF NEW.status IS DISTINCT FROM 'PENDING' THEN NEW.status := 'PENDING'; END IF;
  RETURN NEW;
END $t$;
DROP TRIGGER IF EXISTS "force_payment_insert_pending" ON "Payment";
CREATE TRIGGER "force_payment_insert_pending" BEFORE INSERT ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "fin_payment_insert_pending"();

-- 4. Reservation -> PAID exige Payment APPROVED quando ha Payment (bloqueia a
--    inconsistencia Reservation PAID + Payment PENDING). Override manual
--    (aprovadaNoPainel) e protegido no app por MFA+step-up+audit.
CREATE OR REPLACE FUNCTION "fin_reservation_paid_guard"() RETURNS trigger
  LANGUAGE plpgsql AS $t$
DECLARE tem_pgto_nao_aprovado boolean;
BEGIN
  IF NEW.status = 'PAID' AND OLD.status IS DISTINCT FROM 'PAID' THEN
    SELECT EXISTS (SELECT 1 FROM "Payment" p WHERE p."reservationId" = NEW.id AND p.status <> 'APPROVED')
      INTO tem_pgto_nao_aprovado;
    IF tem_pgto_nao_aprovado AND NOT COALESCE(NEW."aprovadaNoPainel", false) THEN
      RAISE EXCEPTION 'RESERVATION_PAID_SEM_PAGAMENTO_APROVADO';
    END IF;
  END IF;
  RETURN NEW;
END $t$;
DROP TRIGGER IF EXISTS "guard_reservation_paid" ON "Reservation";
CREATE TRIGGER "guard_reservation_paid" BEFORE UPDATE ON "Reservation"
  FOR EACH ROW EXECUTE FUNCTION "fin_reservation_paid_guard"();
