-- Remove o guard por completo. Idempotente.
DROP TRIGGER IF EXISTS "prevent_payment_approval_during_financial_maintenance" ON "Payment";
DROP TRIGGER IF EXISTS "prevent_reservation_paid_during_financial_maintenance" ON "Reservation";
DROP FUNCTION IF EXISTS "_fin_maint_block_payment_approval"();
DROP FUNCTION IF EXISTS "_fin_maint_block_reservation_paid"();
DROP FUNCTION IF EXISTS "_fin_maint_enabled"();
DROP TABLE IF EXISTS "_financial_maintenance_audit";
DROP TABLE IF EXISTS "_financial_maintenance";
