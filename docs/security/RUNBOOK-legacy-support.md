# Runbook de migração assistida de legado (suporte)

Contas legadas (telefone não verificado ou sem telefone) não logam pelo fluxo
novo (fail-closed). A migração é **assistida**, com audit, **sem bypass**.

## Fluxo (operador de suporte)
1. **Abrir caso**: `abrirCasoDeRecuperacao(userId, motivo)` → status OPEN;
   classifica `riskLevel` HIGH se a conta tem patrimônio (caixa/reserva paga).
2. **Revisar**: `revisarCaso(caseId, operador)` → IN_REVIEW. Verificar identidade
   por prova **fora de banda** (o sistema não tem fator forte pré-existente —
   nome/CPF/telefone histórico NÃO são prova).
3. **Aprovar**: `aprovarRecuperacaoLegadoAction({caseId, totp})` — exige admin
   com **MFA + step-up** + audit `LEGACY_RECOVERY_APPROVAL`. Emite um **grant**
   (single-use, expira 24h). **A aprovação NÃO verifica o telefone.**
4. **Novo telefone + OTP**: o usuário informa o novo número; OTP `LEGACY_RECOVERY`
   prova a posse. `solicitarOtpDeRecuperacao` → `concluirRecuperacao`.
5. **Conclusão**: grava `phone` + `phoneVerifiedAt`, **revoga sessões antigas**,
   consome o grant. A partir daí a conta loga por CPF+OTP.
6. Rejeitar/cancelar: `decidirRejeitarOuCancelar` (audit).

Contas HIGH RISK (patrimônio): exigir prova adicional; nunca reset trivial.
