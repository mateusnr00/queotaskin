# Checklist de Backup / PITR (produção) — valores reais TBD pelo operador

Nada aqui é afirmado como habilitado sem prova do operador.
- [ ] Backup automático habilitado (Supabase) — status: TBD
- [ ] PITR habilitado — janela: TBD
- [ ] Retenção — dias: TBD
- [ ] Teste de restore já executado — data: TBD
- [ ] RPO alvo — TBD
- [ ] RTO alvo — TBD

## Runbook de restore (§39)
- Quando restaurar: corrupção de dados, escrita maliciosa confirmada.
- Quem autoriza: dono/responsável de segurança (não o operador sozinho).
- **Consistência com webhooks**: ao restaurar o DB para um ponto passado,
  webhooks antigos reentregues podem reprocessar. Mitigação: **ativar o
  financial maintenance guard ANTES do restore** e mantê-lo até reconciliar;
  a idempotência por `providerEventId` + estado do Payment evita dupla
  aprovação, mas o guard é a rede.
- Pagamentos durante restore: guard ON → tudo PENDING → reconciliar depois.
