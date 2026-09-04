# Threat model: comprometimento da aplicação (RCE com app_runtime)

Assuma um atacante com RCE dentro do processo Next.js, usando a credencial de
runtime (app_runtime), APÓS a separação de roles.

## O que ele NÃO consegue (provado em db-roles.security.test.ts)
- DDL: CREATE/ALTER/DROP TABLE, CREATE FUNCTION — negado.
- Remover/alterar o financial maintenance guard (trigger/função) — negado (não é dono).
- Ligar/desligar a flag do guard — negado (sem escrita em _financial_maintenance).
- UPDATE/DELETE em AdminSecurityEvent e LegacyRecoveryAudit — negado (append-only).

## O que ele AINDA consegue (residual, declarado)
- DML nas tabelas de negócio: pode **aprovar pagamento via `UPDATE Payment SET
  status='APPROVED'`** diretamente, pulando a FSM da aplicação — PORÉM:
  - se o guard estiver ON, o trigger no banco BLOQUEIA a transição;
  - fora de janela de release o guard está OFF, então **a proteção é só a
    aplicação (FSM) + auditoria**, não o banco.
  - **Mitigação futura (P2):** trigger de FSM no banco que rejeite transições
    inválidas de Payment.status independentemente do código. Não implementado.
- Ler dados de negócio (CPF, telefone) — inerente ao runtime; PII no banco.
- Inserir eventos de audit falsos (INSERT permitido) — mas não apagar os reais.

## Comprometimento da migration_role (DB) — §65
Impacto ALTO inevitável (DDL, drop guard, apagar audit). Mitigações: isolamento
(nunca no runtime), acesso restrito, rotação, e a própria separação garante que
uma app comprometida NÃO chega nessa role.
