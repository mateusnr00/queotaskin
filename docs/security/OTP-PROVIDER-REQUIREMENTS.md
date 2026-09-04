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
