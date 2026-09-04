# Classificação de risco das migrations (branch)

| Migration | Classe | Lock | Reversível | Nota |
|---|---|---|---|---|
| idempotencia_de_evento_de_pagamento | EXPAND + UNIQUE INDEX | **CREATE UNIQUE INDEX** (não-concurrent) | aditiva | ver lock abaixo |
| reconciliacao_de_pagamento_tardio | EXPAND | metadata-only | aditiva | default constante |
| desafio_de_autenticacao_e_versao_de_sessao | EXPAND | metadata-only | aditiva | sessionVersion default 0 |
| telefone_verificado_e_cadastro_pendente | EXPAND | metadata-only | aditiva | phoneVerifiedAt nullable |
| recuperacao_assistida_de_legado | EXPAND | trivial | aditiva | tabelas novas |
| admin_mfa_e_auditoria | EXPAND | trivial | aditiva | tabelas novas |

Todas **EXPAND/aditivas** → coexistência OLD/NEW segura (código antigo ignora
colunas/tabelas novas). Nenhuma CONTRACT/DATA/IRREVERSIBLE.

## Lock do UNIQUE INDEX em PaymentWebhookEvent (§15)
`CREATE UNIQUE INDEX (provider, providerEventId)` é non-concurrent → trava
escritas na tabela durante a criação. Estratégia por tamanho (o preflight de
produção mede o row count real — não inventado aqui):
- **< 100k linhas**: migração normal, lock desprezível.
- **100k–1M**: migração normal em janela de baixo tráfego.
- **> 1M**: `CREATE INDEX CONCURRENTLY` fora da transação do Prisma (job
  manual), depois `prisma migrate resolve --applied` — só neste caso, com cuidado.

## Falha de migration no meio (§17)
Prisma marca a migration como falha e trava as seguintes. Recuperação:
corrigir a causa e re-rodar `migrate deploy` (forward-fix), ou `migrate resolve
--rolled-back` se a migration não aplicou nada. Nunca `--applied` casual.
Simulado em scratch: estado consistente, sem aplicação parcial de statements
dentro de uma migration transacional.
