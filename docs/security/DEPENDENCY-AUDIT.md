# Auditoria de dependências (P1-C §47/§48) — classificação, sem upgrade massivo

`npm audit --omit=dev`: 23 vulns (3 critical, 14 high, 3 mod, 3 low). Nenhum
`npm audit fix` rodado (risco de quebra). Classificação por exploitabilidade
NO CONTEXTO deste app:

| Pacote | Sev | CVE/tema | Exploitável aqui? | Ação |
|---|---|---|---|---|
| @auth/core, next-auth, @auth/prisma-adapter | CRITICAL | homoglyph @ bypass no normalizador de **email** | **NÃO** — participante loga por CPF+OTP; admin por email+senha+MFA com match exato + bcrypt; sem magic-link/OAuth por email | monitorar; upgrade quando Auth.js v5 sair de beta |
| next | HIGH | bypass de middleware com **Turbopack + single locale** | verificar: proxy.ts é middleware; app não usa i18n single-locale via Turbopack em prod | aplicar patch de Next quando disponível |
| sharp | HIGH | CVEs libvips (processamento de imagem) | parcial — next/image + upload de capa | upgrade de sharp (patch) recomendado |
| ip-address, fast-uri, hono | HIGH | SSRF/trust-boundary/IP parsing | transitivos; SSRF de gateway já mitigado por baseUrlConfiavel (allowlist) | monitorar; sem uso direto |
| ws, nanoid, js-yaml, postcss, browserslist, brace-expansion, deepmerge-ts, @prisma/config, prisma | HIGH | DoS/quadratic/build-time | baixa — maioria dev/build/transitiva | upgrade incremental controlado |

## Auth.js v5 beta (§48)
Versão: `next-auth ^5.0.0-beta.31`. Beta é risco declarado (API instável,
advisories mais frequentes). **Não trocar de framework agora.** Recomendação:
acompanhar o release estável e o advisory do @auth/core; o vetor de email não se
aplica ao nosso fluxo (CPF+OTP / email+senha+MFA).

## Política
Upgrades de segurança devem ser **incrementais e testados** (rodar a suíte
inteira + build), nunca `npm audit fix --force` cego. CI (`.github/workflows/ci.yml`)
roda a suíte a cada PR, então um upgrade que quebre invariante é pego.
