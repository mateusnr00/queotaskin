<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes, APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# QuéOta Skin

Sorteios de skins de Counter-Strike 2, construído sobre o motor de rifas do
JobRifa (importado de `mateusnr00/rifa-system`).

A camada de domínio do CS2, ficha de skin nos prêmios, cores de raridade,
link de troca da Steam, fila de entregas, está documentada na seção
**Camada CS2** do `README.md`. Comece por `src/lib/cs2.ts`.

## Deploy

`main` é a branch de produção. O build roda
`prisma generate → scripts/migrate-deploy.mjs → next build`, e o script do
meio aplica as migrations quando `DIRECT_URL` existe (só no escopo
Production; Preview pula e apenas compila).

Bootstrap de um ambiente novo: setar `RUN_SEED=1` no primeiro build faz o
mesmo script rodar `prisma/seed.ts` depois das migrations. Sem isso o banco
sobe vazio e toda página pública responde 404, sem `Tenant` cadastrado
nenhum host resolve. **Remova a variável depois do primeiro deploy**: build
não é lugar de escrever dados.

O script ignora `RUN_SEED` quando o banco já tem `Tenant`, então a variável
esquecida não semeia produção de novo. É rede de proteção, não permissão para
deixá-la lá.

## WhatsApp

Todo botão que abre conversa no WhatsApp usa `IconeDoWhatsapp`
(`src/components/icones/whatsapp.tsx`), que é o glifo oficial da marca vindo
do `@remixicon/react`, mais a classe `.botao-de-whatsapp` para o toque. Nada
de balão genérico do lucide: balão genérico promete "chat", não promete
WhatsApp.

Não abra nem mergeie PR sem o usuário pedir.
