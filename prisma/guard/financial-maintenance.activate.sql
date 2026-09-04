-- Ativa a manutencao financeira (atomico). Uso: psql -v actor='operador'
BEGIN;
  UPDATE "_financial_maintenance" SET enabled = true, updated_at = now(),
    updated_by = current_setting('fin.actor', true) WHERE id = true;
  INSERT INTO "_financial_maintenance_audit" (action, actor)
    VALUES ('ACTIVATE', current_setting('fin.actor', true));
COMMIT;
