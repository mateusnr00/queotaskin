# Sistema de registro de atividade

Data: 2026-08-26
Status: aprovado, pronto para virar plano de implementação

## O problema

O painel não guarda memória do que foi feito nele. Quando um preço muda, um
papel é promovido, uma credencial de gateway é trocada ou um ganhador é
declarado, o banco fica com o estado novo e nada sobre quem fez, quando, e o
que havia antes.

Isso cobra em três momentos concretos:

1. **Mais de uma pessoa opera o mesmo painel.** "Quem mudou isso" não tem
   resposta hoje.
2. **Disputa com cliente.** "Paguei e não recebi" só se responde reconstruindo
   à mão, a partir de `Payment` e `PaymentWebhookEvent`, direto no banco de
   produção.
3. **Conta comprometida.** Sem histórico não dá para medir o alcance do
   estrago, e a decisão vira chute.

Duas tabelas já existem e nenhuma resolve isso. `PaymentWebhookEvent` guarda o
payload cru dos gateways: é evidência técnica de um fornecedor, não leitura do
que aconteceu. `LoginAttempt` conta falhas dentro de uma janela e se apaga
sozinha: é freio, não registro.

## Escopo

**Painel.** Entrada no painel e tentativa recusada. Conta criada, dados
editados, papel alterado, senha de painel gerada. Sorteio criado, editado,
duplicado, com status alterado, com conteúdo alterado, excluído. Ganhador
declarado e ganhador removido. Credencial de pagamento alterada. Mensagens,
tema e identidade do site alterados. Catálogo de skins alterado.

**Dinheiro.** Reserva criada, Pix gerado, pagamento aprovado, pagamento
recusado, reservas expiradas pelo cron.

**Uma exceção deliberada ao recorte acima:** alteração do link de troca da
Steam pelo próprio participante. É ação de site público, que o escopo
escolhido deixaria de fora, mas é o endereço para onde a skin vai. Se ele muda
entre o sorteio e a entrega, é a primeira coisa que se quer olhar, e o volume
é ínfimo. Fica dentro.

**Fora.** Abertura de caixa surpresa, título premiado, crédito de XP, login de
cliente e navegação em geral. Volume alto e valor de auditoria baixo: um
sorteio de mil números produziria milhares de linhas que ninguém vai ler, e
elas afogariam as poucas que importam.

## Decisão de arquitetura

Três caminhos foram considerados.

**Extension do Prisma logando todo write.** Impossível esquecer de
instrumentar, pega até escrita feita por script. Descartado por dois motivos
que não têm conserto: nesse nível não existe sessão, então o registro não sabe
QUEM fez sem carregar a identidade num `AsyncLocalStorage`; e ele registra
operações de banco, não intenções, então publicar um sorteio de mil números
viraria mil linhas indistinguíveis. Vira log de banco, não auditoria.

**Wrapper genérico em volta de cada server action.** Instrumenta tudo de uma
vez. Descartado porque o Next não tem registro central de actions: o wrapper
teria que envolver cada export do mesmo jeito que uma chamada explícita, com o
mesmo custo, e o que ele consegue registrar sozinho é "updateUserAction ok",
que não ajuda ninguém numa disputa. Perde exatamente o que dá valor ao log.

**Escolhido: tabela `ActivityLog` mais um `registrarLog()` chamado
explicitamente em cada ponto que importa.** Registra só o que vale, com
descrição legível e com o antes e o depois. O custo é ter que tocar em cada
action, e o risco é alguém criar uma action nova e esquecer de instrumentar.

Contra esse risco, uma peça emprestada do segundo caminho: o catálogo de ações
é uma união de strings tipada. O TypeScript recusa ação inventada, a tela sabe
desenhar cada uma, e um teste garante que toda chave do catálogo tem texto.

## Modelo de dados

```prisma
enum LogOrigin {
  PAINEL  // alguém clicou no admin
  SISTEMA // webhook de gateway, cron
  PUBLICO // ação do participante no site
}

model ActivityLog {
  id String @id @default(cuid())

  /// Painel a que o registro pertence. Nulo apenas em evento sem tenant
  /// resolvido, como a varredura global do cron.
  tenantId String?
  tenant   Tenant? @relation("TenantActivityLogs", fields: [tenantId], references: [id], onDelete: Cascade)

  origem LogOrigin @default(PAINEL)

  /// Ator CONGELADO, não por relação, e essa é a decisão central do modelo.
  /// Uma foreign key para User faria o histórico depender de a conta
  /// continuar existindo e com o mesmo nome, quando o caso que mais
  /// interessa é justamente o da conta removida ou renomeada depois do ato.
  actorId    String?
  actorName  String
  actorRole  Role?
  actorEmail String?

  /// Chave do catálogo (src/lib/activity-log-actions.ts).
  acao String

  /// Alvo, para responder "tudo que aconteceu com este sorteio".
  /// O rótulo também é congelado, pelo mesmo motivo do ator.
  alvoTipo   String?
  alvoId     String?
  alvoRotulo String?

  /// { antes, depois } dos campos que mudaram, ou payload curto do evento.
  detalhes Json?

  ip String?

  criadoEm DateTime @default(now())

  @@index([tenantId, criadoEm])
  @@index([alvoTipo, alvoId])
  @@index([acao, criadoEm])
  @@index([actorId, criadoEm])
}
```

A tabela é append-only: o código nunca faz `update` nela, e a interface não
oferece exclusão. A única escrita destrutiva é a limpeza por idade, descrita
adiante.

`onDelete: Cascade` no tenant é proposital. Apagar um painel apaga o histórico
dele junto; manter registros órfãos só produziria ruído global visível ao
SUPER_ADMIN, sobre um painel que não existe mais.

Migration: `prisma/migrations/<timestamp>_registro_de_atividade/`, seguindo a
convenção de nome em português já usada no diretório. `Tenant` ganha o campo
de volta da relação:
`activityLogs ActivityLog[] @relation("TenantActivityLogs")`.

## O serviço

`src/server/services/activity-log.ts`, com uma função só de escrita:

```ts
/// Entidades que um registro pode apontar. String fechada, não livre: a tela
/// precisa saber para onde linkar cada alvo.
export type TipoDeAlvo =
  | "User"
  | "Raffle"
  | "Reservation"
  | "Payment"
  | "SkinTemplate"
  | "Tenant";

export interface EntradaDeLog {
  acao: AcaoDeLog;
  tenantId?: string | null;
  alvo?: { tipo: TipoDeAlvo; id: string; rotulo?: string | null };
  detalhes?: Record<string, unknown>;
  /// Onde a ação nasceu. Padrão PAINEL. É independente de quem agiu: a troca
  /// do link da Steam tem ator de sessão e origem PUBLICO ao mesmo tempo.
  origem?: LogOrigin;
  /// Só quando NÃO há sessão para ler: webhook de gateway e cron. Com ator
  /// informado, a sessão nem é consultada.
  ator?: { nome: string };
}

export async function registrarLog(entrada: EntradaDeLog): Promise<void>;
```

Três regras de funcionamento:

**Nunca lança.** Todo o corpo vive dentro de um `try/catch` que termina em
`console.error`. Um registro que falha não pode derrubar a venda, a promoção
ou o pagamento que ele estava registrando. É o mesmo princípio já aplicado às
entregas de prêmio depois do webhook, em `pix.ts` e no handler.

**Resolve o ator sozinho quando pode.** Sem o campo `ator`, lê a sessão por
`auth()` e grava id, nome, papel e e-mail do momento. O IP sai de
`ipDaRequisicao(await headers())`, reaproveitando o extrator que já existe em
`login-throttle.ts` e que já prefere `x-real-ip` ao `X-Forwarded-For`
forjável. Fora de escopo de requisição, `headers()` lança, e o `catch` interno
trata: o registro entra sem IP em vez de sumir.

**Não espera, quando está no caminho do cliente.** As chamadas em fluxo de
venda (`reserva.criada`, `pix.gerado`, webhook de pagamento) usam
`void registrarLog(...)` para não somar latência de escrita ao que a pessoa
está esperando na tela. As de painel podem aguardar: são raras e o admin não
sente.

## Catálogo de ações

`src/lib/activity-log-actions.ts` exporta um objeto constante que mapeia chave
para o texto em português mostrado na tela, e o tipo sai dele:

```ts
export const ACOES = {
  "painel.login":               "entrou no painel",
  "painel.login_recusado":      "teve a entrada recusada",
  "usuario.criado":             "criou a conta",
  "usuario.editado":            "editou os dados de",
  "usuario.papel_alterado":     "mudou o papel de",
  "usuario.senha_gerada":       "gerou senha de painel para",
  "usuario.trade_url_alterada": "trocou o link de troca da Steam",
  "sorteio.criado":             "criou o sorteio",
  "sorteio.editado":            "editou o sorteio",
  "sorteio.duplicado":          "duplicou o sorteio",
  "sorteio.status_alterado":    "mudou o status do sorteio",
  "sorteio.conteudo_alterado":  "mudou o conteúdo do sorteio",
  "sorteio.excluido":           "excluiu o sorteio",
  "sorteio.ganhador_definido":  "declarou o ganhador de",
  "sorteio.ganhador_removido":  "removeu o ganhador de",
  "config.pagamento_alterada":  "alterou as credenciais de pagamento",
  "config.site_alterada":       "alterou as configurações do site",
  "config.mensagens_alterada":  "alterou as mensagens automáticas",
  "skin.alterada":              "alterou o catálogo de skins",
  "reserva.criada":             "reservou números",
  "pix.gerado":                 "gerou o Pix",
  "pagamento.aprovado":         "confirmou o pagamento",
  "pagamento.recusado":         "recusou o pagamento",
  "reservas.expiradas":         "expirou reservas pendentes",
} as const;

export type AcaoDeLog = keyof typeof ACOES;
```

A granularidade é deliberadamente desigual. `raffle-content.ts` exporta
quatorze actions (capa, imagens, prêmios, promoções, títulos premiados,
combos e prêmios de caixa surpresa, provedor de pagamento do sorteio). Todas
entram como `sorteio.conteudo_alterado`, com `detalhes.o_que` nomeando a parte
que mudou. Uma chave por action encheria o catálogo e o filtro da tela sem
responder nada que `o_que` não responda.

Declarar e remover ganhador são a exceção: saem de `raffle-content.ts` mas
ganham chave própria, porque decidem quem recebe uma skin.

## Pontos de instrumentação

| Arquivo | Ações |
| --- | --- |
| `src/auth.ts` (provider `admin-password`) | `painel.login`, `painel.login_recusado` |
| `src/server/actions/users.ts` | `usuario.criado`, `usuario.editado`, `usuario.papel_alterado`, `usuario.senha_gerada` |
| `src/server/actions/raffles.ts` | `sorteio.criado`, `sorteio.editado`, `sorteio.status_alterado`, `sorteio.excluido` |
| `src/server/actions/raffle-duplicate.ts` | `sorteio.duplicado` |
| `src/server/actions/raffle-content.ts` | `sorteio.conteudo_alterado`, `sorteio.ganhador_definido`, `sorteio.ganhador_removido` |
| `src/server/actions/payment-settings.ts` | `config.pagamento_alterada` |
| `src/server/actions/settings.ts` | `config.site_alterada` |
| `src/server/actions/messages-settings.ts` | `config.mensagens_alterada` |
| `src/server/actions/skin-templates.ts` | `skin.alterada` |
| `src/server/actions/steam.ts` | `usuario.trade_url_alterada` (origem `PUBLICO`) |
| `src/server/actions/reservations.ts` | `reserva.criada` |
| `src/server/services/pix.ts` | `pix.gerado`, e `pagamento.aprovado` pelo caminho de polling |
| `src/app/api/webhooks/*/route.ts` | `pagamento.aprovado`, `pagamento.recusado` (origem `SISTEMA`) |
| `src/app/api/cron/expire-reservations/route.ts` | `reservas.expiradas` (origem `SISTEMA`) |

O cron grava **uma linha por execução**, com a contagem em `detalhes`, e só
quando expirou alguma coisa. Uma linha por reserva expirada somaria centenas
de registros por dia sobre um evento que ninguém investiga individualmente, e
uma linha a cada cinco minutos dizendo "expirei zero" seria pior ainda.

`pagamento.aprovado` sai do webhook e do polling, que são dois caminhos para o
mesmo fato. A confirmação já é idempotente nos dois lados, então o registro
segue a mesma guarda: só grava quem efetivamente mudou o estado da reserva,
senão um pagamento apareceria duas vezes na tela.

`usuario.papel_alterado` é gravado no lugar de `usuario.editado` quando o
papel mudou, mesmo que outros campos tenham mudado junto: é o que alguém
procura, e esconder isso dentro de "editou os dados" apagaria a promoção no
meio do barulho.

## Privacidade e segredos

Duas regras duras no serviço, aplicadas antes de qualquer escrita.

**Segredo nunca entra em `detalhes`.** Credencial de gateway, senha temporária
e hash de senha ficam fora, inclusive do lado "antes". O registro diz que o
campo mudou, nunca o valor. Vale para `payment-settings.ts` e para
`usuario.senha_gerada`. Um log que guarda a credencial que ele deveria
proteger transforma a auditoria em outro alvo.

**CPF entra mascarado**, no formato `***.***.789-00`. O painel já mostra CPF
completo nas telas de cliente; o log não precisa virar uma segunda cópia da
base de PII, com retenção própria e leitura mais ampla. O suficiente aqui é
conseguir conferir que é a mesma pessoa.

A função que aplica as duas regras é exportada e testada em separado, para não
depender da disciplina de quem chama.

## Visibilidade e multi-tenant

ADMIN enxerga o próprio painel; SUPER_ADMIN enxerga todos. A consulta é
filtrada por `tenantId` vindo de `getActiveTenantIdForAdmin(session.user)`, o
mesmo helper que já prende as escritas de painel ao host de admin, e nunca por
parâmetro vindo do cliente.

Registro de admin fica visível para os outros admins do mesmo painel, de
propósito. Auditoria que só o dono lê não resolve o caso mais comum aqui, que
é dois operadores no mesmo painel querendo saber quem mexeu no quê.

## Retenção

365 dias, apagados pelo cron `expire-reservations`, que já roda a cada cinco
minutos. A limpeza acontece no máximo uma vez por dia, guardada por uma
consulta ao registro mais antigo, e apaga em lotes, para não segurar a rota de
cron numa deleção grande.

Um ano cobre o ciclo de disputa de pagamento e de chargeback com folga, e
mantém a tabela num tamanho que o índice por `(tenantId, criadoEm)` resolve
sem esforço.

## A tela

`/admin/logs`, no menu do painel.

Lista em ordem decrescente de data, paginada por cursor sobre
`(criadoEm, id)`. Paginação por deslocamento erraria: a tabela recebe linhas
novas o tempo todo no topo, e a página 2 mostraria de novo o que a 1 já
mostrou.

Cada linha traz data e hora, o ator com o selo do papel, a frase montada a
partir do catálogo, o alvo linkando para a tela dele, e um seletor que abre o
antes e o depois. Evento de origem `SISTEMA` aparece com selo próprio, para
não parecer que alguém clicou.

Filtros: período, pessoa, tipo de ação e busca por alvo. Todos por
querystring, no mesmo formato de formulário GET puro já usado na busca de
`/admin/usuarios`, então o resultado sobrevive ao recarregar e é
compartilhável.

Da ficha de um usuário e da edição de um sorteio, um atalho "ver histórico"
abre a tela já filtrada naquele alvo. É por ali que a consulta costuma começar
de verdade: alguém está olhando para um registro e quer saber como ele chegou
naquele estado.

## Testes

Unitários, sem banco:

- `registrarLog` não lança quando a escrita falha, e reporta no console.
- Segredo não sobrevive à sanitização, nem em `antes` nem em `depois`.
- CPF sai mascarado.
- Toda chave de `ACOES` tem texto, e nenhuma chave usada no código está fora
  do catálogo.

De integração, no padrão dos que já existem (pulam sozinhos fora do banco
local):

- Promover um usuário grava uma linha `usuario.papel_alterado` com o papel
  anterior e o novo.
- A consulta da tela não devolve registro de outro tenant para um ADMIN.
- Duas execuções do cron no mesmo dia produzem uma limpeza só.

## Decisões adiadas

Exportar em CSV, alerta por e-mail em ação sensível e assinatura em cadeia
contra adulteração ficam de fora desta rodada. Nenhum deles muda o modelo
acima, e todos podem ser acrescentados depois sem migration nova.
