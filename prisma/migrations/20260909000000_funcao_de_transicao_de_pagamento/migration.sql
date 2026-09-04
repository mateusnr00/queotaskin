-- P1-C 7.1: unica funcao autoritativa de transicao de Payment.status. ADITIVO.
-- SECURITY DEFINER: roda como a DONA do schema; em producao a app_runtime NAO
-- tem UPDATE(status) direto (ver prisma/roles/financial-fsm-lockdown.sql), entao
-- este e o unico caminho de escrita de status. A matriz e reforcada aqui:
-- transicao impossivel e recusada mesmo chamando a funcao. O guard financeiro
-- continua no seu proprio trigger (BEFORE UPDATE), com precedencia fail-closed.
CREATE OR REPLACE FUNCTION "fin_transicao_pagamento"(
  p_id text,
  p_novo text,
  p_verificado boolean
) RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $fn$
DECLARE
  atual "PaymentStatus";
  destino "PaymentStatus";
  permitido boolean;
BEGIN
  BEGIN destino := p_novo::"PaymentStatus"; EXCEPTION WHEN others THEN RETURN 'INVALIDA'; END;
  SELECT status INTO atual FROM "Payment" WHERE id = p_id FOR UPDATE;
  IF atual IS NULL THEN RETURN 'SUMIU'; END IF;
  IF atual = destino THEN RETURN 'NOOP'; END IF;
  IF destino = 'APPROVED' AND NOT COALESCE(p_verificado, false) THEN RETURN 'SEM_VERIFICACAO'; END IF;
  permitido :=
       (atual = 'PENDING'  AND destino IN ('APPROVED','REJECTED','CANCELLED','REFUNDED'))
    OR (atual = 'APPROVED' AND destino = 'REFUNDED');
  IF NOT permitido THEN RETURN 'INVALIDA'; END IF;

  UPDATE "Payment"
     SET status = destino,
         "paidAt" = CASE WHEN destino = 'APPROVED' THEN now() ELSE "paidAt" END,
         "updatedAt" = now()
   WHERE id = p_id AND status = atual;
  IF NOT FOUND THEN RETURN 'CORRIDA'; END IF;
  RETURN 'OK';
END
$fn$;

REVOKE ALL ON FUNCTION "fin_transicao_pagamento"(text, text, boolean) FROM PUBLIC;
