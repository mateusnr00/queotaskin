# EXTERNAL PARTICIPANT OTP PROVIDER = NOT REQUIRED BY PRODUCT DESIGN (FASE 10.2)

Decisao de produto: participante autentica por **CPF + SENHA** (sem SMS/
WhatsApp/OTP externo). A abstracao OtpDeliveryProvider permanece como codigo,
mas nenhum fluxo de participante depende dela. Admin usa TOTP (offline), nao
este provider. O conteudo abaixo fica historico.

---

# Requisitos do provider de OTP de participante (§14-16)

O domínio fala com `OtpDeliveryProvider` (src/server/services/otp/provider.ts).
Um provider real implementa:

```
interface OtpDeliveryProvider {
  readonly nome: string;
  enviar(destino: {phoneCountry, phoneDigits}, codigo: string, ctx: {purpose}): Promise<void>;
}
```

## Contrato
- **request**: server-to-server (sem expor credencial ao cliente); E.164 a partir
  de phoneCountry+phoneDigits.
- **success**: resolve a Promise; nunca retorna/loga o código.
- **timeout**: rejeitar após um teto curto; quem chama trata como falha (o OTP
  não é marcado como entregue; o desafio expira).
- **retry**: controlado pelo rate-limit já existente (REQUEST/RESEND buckets);
  o provider não deve reenviar sozinho de forma ilimitada.
- **rate limit / anti-abuse**: já há buckets fail-closed antes do envio (§40 P1-A).
- **provider unavailable**: `provedorDeOtp()` lança → **fail-closed** (login/
  cadastro indisponíveis, nunca fracos). NÃO criar fallback inseguro.
- **logging/redaction**: nunca logar código/telefone completo (usar log-redaction).

## Critérios de seleção (sem escolher vendor)
Brasil; SMS e/ou WhatsApp; status de entrega; API S2S; timeout configurável;
rate limits; preço; anti-abuso; tratamento de dados (LGPD); SLA.

## Rollout
test mode (FakeOtpProvider, atual) → staging (provider real, números de teste)
→ prod canary → prod. **Sem provider real → fail-closed** (bloqueia abertura ao
público, nunca destrava login fraco).


## Arquitetura implementada (FASE 10)
- `provedorDeOtp()` -> `resolverProviderDeOtp()` (provider-registry): seleciona
  por `OTP_PROVIDER`. **fail-closed**: sem env=erro; fake/mock so fora de prod;
  nome real sem adapter registrado=desconhecido=erro.
- `providers/http.ts` (`HttpOtpProvider`): adapter S2S generico com timeout (8s),
  `redirect:"error"`, mapeamento de status->enum (`tipos.ts`:
  SUCCESS/TIMEOUT/TEMPORARY/PERMANENT/RATE_LIMITED), sem logar codigo/telefone/
  response. O **corpo especifico do vendor** (`montarRequisicao`) e o unico
  ponto pendente: sem vendor, fail-closed (nao inventamos API).
- `baseUrlDeOtpConfiavel`: HTTPS + allowlist (vazia ate escolher vendor) -> em
  prod, nenhuma baseUrl arbitraria passa (anti-SSRF).
- env-validation (prod): OTP_PROVIDER obrigatorio != fake, API key obrigatoria,
  baseUrl HTTPS.
- **REAL PROVIDER INTEGRATION = BLOCKED BY PROVIDER SELECTION**: registrar o
  adapter do vendor em `REAIS` no provider-registry quando escolhido.
