-- Desativa a manutencao financeira (atomico).
BEGIN;
  UPDATE "_financial_maintenance" SET enabled = false, updated_at = now(),
    updated_by = current_setting('fin.actor', true) WHERE id = true;
  INSERT INTO "_financial_maintenance_audit" (action, actor)
    VALUES ('DEACTIVATE', current_setting('fin.actor', true));
COMMIT;
