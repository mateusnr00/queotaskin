# Seleção do provider de OTP (participante) — decisão humana

**Nenhum vendor escolhido.** Esta matriz é para o time preencher/verificar antes
de integrar. **Não preencher com palpite** — marcar `TBD / HUMAN VERIFY` quando
não confirmado por documentação oficial. Nada aqui foi pesquisado na web.

| Coluna | O que verificar |
|---|---|
| PROVIDER | nome do vendor |
| CHANNEL | SMS / WhatsApp / ambos |
| BRAZIL SUPPORT | cobertura BR confirmada |
| OFFICIAL OTP API | API oficial de envio de OTP/mensagem |
| SERVER-TO-SERVER | envio S2S (sem expor credencial ao cliente) |
| IDEMPOTENCY | header/chave de idempotência (evita duplicate on retry) |
| TIMEOUT | timeout recomendado |
| DELIVERY STATUS | há status? (é telemetria, NÃO prova de identidade) |
| RATE LIMIT INFO | limites do vendor |
| WEBHOOK SIGNATURE | assinatura do webhook de delivery, se houver |
| PRICING MODEL | por mensagem / assinatura |
| DATA LOCATION / PRIVACY | onde os dados trafegam/armazenam (LGPD) |
| SDK REQUIRED? | precisa de SDK ou fetch nativo basta |
| CAN USE NATIVE FETCH? | sim/não |
| STATUS | candidato / aprovado / descartado |

| PROVIDER | CHANNEL | BRAZIL | OFFICIAL API | S2S | IDEMPOTENCY | TIMEOUT | DELIVERY | RATE LIMIT | WEBHOOK SIG | PRICING | DATA/PRIVACY | SDK? | FETCH? | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| (a preencher) | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

## Contrato de prontidão do adapter (§28)
Quando o vendor for escolhido, implementar SOMENTE isto (o resto da arquitetura
já está pronto — `HttpOtpProvider` + `provider-registry`):
1. **official base URL** (host oficial → adicionar à allowlist `HOSTS_OTP_PERMITIDOS`).
2. **endpoint** de envio.
3. **auth header** (`Authorization`/`x-api-key`, do env, server-only).
4. **request payload** (`montarRequisicao`): formato do telefone (E.164), corpo.
5. **idempotency header** se suportado.
6. **success codes** (2xx) e mapeamento de retryable (5xx/429) vs permanent (4xx).
7. **rate-limit** do vendor (respeitar 429 → RATE_LIMITED).
8. **webhook signature** só se for implementar delivery webhook (não autentica usuário).
Registrar em `provider-registry.ts`:
`REAIS["<vendor>"] = () => new HttpOtpProvider({ nome, baseUrl, apiKey, montarRequisicao })`.
Setar `OTP_PROVIDER=<vendor>` + `OTP_PROVIDER_API_KEY` + `OTP_PROVIDER_BASE_URL`.

## Restrições permanentes
- `OTP_PROVIDER=fake/mock` proibido em produção (fail-fast).
- baseUrl: HTTPS + allowlist; nunca `https://*`, hostname de env arbitrário, ou IP.
- secret do provider: server-only, nunca `NEXT_PUBLIC`.
- sem SDK gigante se `fetch` nativo resolver.
