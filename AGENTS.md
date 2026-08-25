<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# QuéOta Skin

Sorteios de skins de Counter-Strike 2, construído sobre o motor de rifas do
JobRifa (importado de `mateusnr00/rifa-system`).

A camada de domínio do CS2 — ficha de skin nos prêmios, cores de raridade,
link de troca da Steam, fila de entregas — está documentada na seção
**Camada CS2** do `README.md`. Comece por `src/lib/cs2.ts`.

## Deploy

Este repositório **ainda não tem** branch `main`, projeto na Vercel nem
`prisma migrate deploy` no build de produção. A regra de auto-merge que veio
do `rifa-system` foi removida porque descrevia a infraestrutura daquele
repositório, não deste.

Enquanto o deploy não estiver montado: desenvolva na branch combinada,
commite e faça push. **Não abra nem mergeie PR sem o usuário pedir.**

Quando a Vercel for conectada, adicionar aqui o fluxo real (incluindo o
passo de migrations no build — as migrations em `prisma/migrations/` precisam
rodar antes do `next build` em produção, como fazia o `scripts/migrate-deploy.mjs`).
