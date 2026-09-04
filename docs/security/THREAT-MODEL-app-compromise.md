# Threat model: comprometimento da aplicação (RCE com app_runtime)

Assuma um atacante com RCE dentro do processo Next.js, usando a credencial de
runtime (app_runtime), APÓS a separação de roles.

## O que ele NÃO consegue (provado em db-roles.security.test.ts)
- DDL: CREATE/ALTER/DROP TABLE, CREATE FUNCTION — negado.
- Remover/alterar o financial maintenance guard (trigger/função) — negado (não é dono).
- Ligar/desligar a flag do guard — negado (sem escrita em _financial_maintenance).
- UPDATE/DELETE em AdminSecurityEvent e LegacyRecoveryAudit — negado (append-only).

## O que ele NÃO consegue mais (FASE 7.1 — lockdown financeiro)
- `UPDATE Payment SET status='APPROVED'` via DML cru → **negado** (app_runtime
  perde UPDATE da coluna status; provado em db-financial-fsm.security).
- INSERT de Payment já APPROVED → **forçado a PENDING** por trigger.
- `UPDATE Reservation SET status='PAID'` com Payment não-aprovado → **negado**.
- Alterar/dropar a função autoritativa ou os triggers → **negado** (não é dono).

## O que ele AINDA consegue (residual menor, declarado)
- Chamar a função autoritativa `fin_transicao_pagamento(id,'APPROVED',true)` para
  aprovar um Payment PENDING (a função é o caminho legítimo; enforça a matriz +
  guard, mas não re-verifica o gateway — impossível no banco). Ou seja: raw DML
  não aprova, mas um RCE que invoca a função da app pode. Mitigação: guard ON
  durante releases + auditoria + a matriz/guard no banco impedem transições
  impossíveis e aprovação sob manutenção.
- Inserir eventos de audit falsos (INSERT permitido) — mas não apagar os reais.
- Ler dados de negócio (CPF, telefone) — inerente ao runtime; PII no banco.
- Inserir eventos de audit falsos (INSERT permitido) — mas não apagar os reais.

## Comprometimento da migration_role (DB) — §65
Impacto ALTO inevitável (DDL, drop guard, apagar audit). Mitigações: isolamento
(nunca no runtime), acesso restrito, rotação, e a própria separação garante que
uma app comprometida NÃO chega nessa role.
