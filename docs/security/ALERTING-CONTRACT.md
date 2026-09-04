# Contrato de alertas (eventos → severidade → limiar → ação)

Não integra Datadog/Sentry ainda; define o contrato. Eventos vêm de logs
estruturados / `AdminSecurityEvent` / `PAYMENT_*` logs. Nenhum dado sensível.

## Pagamentos
| Evento | Severidade | Limiar | Ação |
|---|---|---|---|
| PAYMENT_AMOUNT_MISMATCH | CRITICAL | qualquer 1 | bloquear (já é PENDING) + investigar |
| PAYMENT_IDENTITY_MISMATCH | CRITICAL | qualquer 1 | investigar fraude/config |
| PAYMENT_VERIFICATION unavailable | HIGH | pico/sustentado | checar gateway; segue PENDING |
| webhook assinatura inválida | HIGH | taxa alta | possível ataque; checar secret |
| PAYMENT_REQUIRES_RECONCILIATION | HIGH | backlog crescendo | rodar reconciliador; investigar |
| PAYMENT_OVERRIDE (manual) | HIGH | qualquer | revisar ator + motivo |
| FINANCIAL_MAINTENANCE ativa | MEDIUM | fora de janela de release | investigar |
| guard bloqueou aprovação | MEDIUM | fora de release | código tentou aprovar sob guard |

## Auth / Admin
| Evento | Severidade | Limiar | Ação |
|---|---|---|---|
| admin brute force (ADMIN_PASSWORD_ATTEMPT) | HIGH | bucket estourado | bloquear IP/conta |
| MFA_FAILURE | HIGH | repetido | possível takeover |
| RECOVERY_CODE_USED | HIGH | qualquer | confirmar legitimidade |
| STEP_UP_FAILURE | MEDIUM | repetido | ação crítica sob tentativa |
| ROLE_CHANGE denied | HIGH | qualquer | tentativa de escalação |
| LEGACY_RECOVERY_APPROVAL | HIGH | qualquer | revisar caso + ator |
| participant password brute-force | HIGH | bucket estourado | possivel credential stuffing |
| login failure spike (participante) | HIGH | pico | investigar |
| password reset activity (recovery) | MEDIUM | pico | revisar casos |

> Nota (FASE 10.2): removidos os alertas de OTP de entrega participante
> (`OTP_SEND_FAILURE`, `OTP provider unavailable`) — o login é CPF+senha, sem
> provider externo. A cobertura de auth participante fica nas linhas de
> brute-force/login failure acima.
