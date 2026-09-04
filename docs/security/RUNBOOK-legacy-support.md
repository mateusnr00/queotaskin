# Runbook de migração assistida de legado (suporte)

Contas legadas **sem `passwordHash`** (`LEGACY_NO_PASSWORD`) não logam pelo fluxo
novo (fail-closed). A migração é **assistida**, com audit, **sem bypass**. Desde a
FASE 10.2 o login do participante é **CPF+senha**; a recuperação assistida
**define uma nova senha** para a conta (não verifica telefone).

## Fluxo (operador de suporte)
1. **Abrir caso**: `abrirCasoDeRecuperacao(userId, motivo)` → status OPEN;
   classifica `riskLevel` HIGH se a conta tem patrimônio (caixa/reserva paga).
2. **Revisar**: `revisarCaso(caseId, operador)` → IN_REVIEW. Verificar identidade
   por prova **fora de banda** (o sistema não tem fator forte pré-existente —
   nome/CPF/telefone histórico NÃO são prova).
3. **Aprovar**: `aprovarRecuperacaoLegadoAction({caseId, totp})` — exige admin
   com **MFA + step-up** + audit `LEGACY_RECOVERY_APPROVAL`. Emite um **grant**
   (single-use, expira 24h). **A aprovação NÃO verifica o telefone.**
4. **Nova senha**: com o grant, o usuário define a nova senha
   (`redefinirSenhaPorRecuperacaoAction` → `concluirRecuperacaoComSenha({caseId,
   grant, novaSenha})`). Erros neutros (sem enumeration).
5. **Conclusão**: grava `passwordHash`, **revoga sessões antigas**, consome o
   grant (single-use) e fecha o caso. **O telefone NÃO é verificado** por este
   fluxo. A partir daí a conta loga por **CPF+senha**.
6. Rejeitar/cancelar: `decidirRejeitarOuCancelar` (audit).

Contas HIGH RISK (patrimônio): exigir prova adicional; nunca reset trivial.
