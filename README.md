# QuéOta Skin, Sorteios de skins de Counter-Strike 2

Plataforma de sorteios (rifas) nichada em skins de CS2: facas, luvas e
coberturas lendárias, com pagamento por PIX e entrega por oferta de troca
na Steam.

Construída sobre o motor de rifas do JobRifa (Next.js 16 + Postgres), com
uma camada de domínio própria do Counter-Strike descrita em
[Camada CS2](#camada-cs2).

## Stack

- **Framework**: Next.js 16 (App Router, Server Actions, Cache Components, Turbopack)
- **Linguagem**: TypeScript (strict)
- **Banco**: PostgreSQL via Supabase
- **ORM**: Prisma 6
- **Auth**: Auth.js v5 (NextAuth) com Prisma adapter + credentials
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Validação**: Zod
- **Forms**: react-hook-form + `@hookform/resolvers/zod`
- **Storage**: Supabase Storage (Fase 2)
- **Pagamentos**: Mercado Pago (Fase 2)
- **Email**: Resend (Fase 2)
- **Jobs / Cron**: Vercel Cron (atual) → Inngest (Fase 2)
- **PDF**: `@react-pdf/renderer` (Fase 2)
- **Testes**: Vitest

## Camada CS2

O que diferencia o QuéOta Skin de uma plataforma de rifa genérica.

### Ficha da skin no prêmio

Cada `Prize` carrega os metadados do item: nome, **raridade** (as 8 faixas
do CS2, com as cores oficiais da Valve), **desgaste** (FN/MW/FT/WW/BS),
**float**, StatTrak™, Souvenir, valor de mercado, coleção e link de
inspeção no jogo. Todos os campos são opcionais, um prêmio que não é skin
(saldo, periférico) usa só a descrição e renderiza num card neutro.

Cadastro em **Admin → Sorteios → Editar → Prêmios**. Ao digitar o float, o
painel confere se o desgaste escolhido bate com as faixas oficiais e
oferece a correção em um clique.

### A capa da campanha principal é outra moldura

A arte de skin é 4:3 (`QUADRO_DA_SKIN`, 1800 × 1350). O card grande do topo da
vitrine é **panorâmico**: 16:9 no celular e 2:1 no desktop, com `object-cover`.
Uma arte 4:3 ali perde um terço da altura, em cima e embaixo, que é justamente
onde o nome e o desgaste costumam estar escritos.

Para a principal, a capa deve ser **1800 × 900 (2:1)**. Como o celular exibe a
mesma imagem em 16:9, que é mais alto, lá o corte vira das laterais: cerca de
5,5% de cada lado. A regra prática é uma só: logo e texto no miolo.

As classes da moldura moram em `MOLDURA_DO_DESTAQUE` (`lib/raffle-images.ts`) e
são usadas pelo card público E pela prévia do painel, que desenha a capa atual
dentro dela com as faixas do corte do celular marcadas. O aviso aparece só na
campanha marcada como principal, na aba Imagens do editor.

### Importar uma pasta de artes de uma vez

**Admin → Catálogo de skins → Importar artes.** O acervo de artes já nasce
com o nome escrito no arquivo ("AK-47 | Redline (Field-Tested).png"), e é
esse nome que o importador lê: `lerArquivoDeSkin` separa a skin do desgaste,
e `procurar` (o mesmo casador de `scripts/adicionar-skins.ts`) acha a linha
do catálogo. Aceita como a Steam escreve e como se digita de cabeça
("awp asiimov ft.png"), ignora a estrela das facas, o StatTrak™, a numeração
da frente ("01 - ") e o "(1)" que o download em massa gruda no fim.

A tela mostra o que vai gravar ANTES de gravar: cada arquivo com a skin
encontrada, o desgaste lido e um aviso quando já existe arte para aquele
desgaste. O que não casou não vira cadastro em silêncio: fica numa linha
para escolher a skin na mão, cadastrar uma nova com aquele nome, ou pular.
O envio é um arquivo por vez, de propósito, para uma falha não levar as
outras junto e para dar para ver qual falhou.

### A linha de prêmio é uma linha só

`031  AK-47 | Vulcan  FT  ················  ● Disponível`

Na ordem em que a pergunta é feita: qual número, o que é, em que estado, e se
ainda dá para pegar. Todos os elementos têm largura fixa menos o nome, então
as colunas se alinham entre as linhas sem grid, e o olho encontra cada
informação sempre no mesmo x.

Nome e sigla andam JUNTOS, num grupo só: os dois descrevem o mesmo item, e a
sigla gruda no fim do nome em vez de flutuar na largura que sobrou. Com o nome
esticando sozinho (`flex-1`), "FT" era empurrado para perto do estado e
parecia pertencer a ele.

O desgaste é a **sigla** (FN, MW, FT, WW, BS). "Field-Tested" ocupa quatro
vezes o espaço e diz a mesma coisa para quem joga; numa linha única, é o texto
que empurra o nome da skin para fora.

O estado ancora à direita com `ml-auto` e um degradê que morre para a
esquerda: separa sem borda nem faixa, e preenchimento sólido numa lista com
metade contemplada vira parede de cor.

O texto do estado aparece SEMPRE, inclusive no telefone. Ele chegou a sumir lá,
sobrando o pingo, para dar largura ao nome, e a economia não valeu: um pingo
verde sozinho não diz "disponível" para quem nunca viu a lista, e o estado é
metade do que a linha existe para responder. O espaço sai do resto (rótulo de
10px e respiro menor no degradê), e o nome, único elástico, absorve.

### A foto da skin no cadastro do prêmio

`AwardedTicket.skinImageUrl` é copiada do catálogo pelo MESMO casamento de
nome que já resolvia a raridade (`imagemDoPremio`, irmã de `raridadeDoPremio`),
na hora de salvar os títulos premiados.

A lista pública NÃO a exibe: a miniatura chegou a existir e saiu, porque num
quadrado de 40px o render da Steam vira uma manchinha e só empurrava número e
nome para dentro da linha. A cor da raridade no nome dá a mesma leitura de
relance, e a foto grande continua no topo da campanha, onde ela funciona.

A coluna fica preenchida assim mesmo: custa uma linha na gravação, e a foto
volta sem reprocessar nada se um dia servir noutro lugar.

Título premiado cadastrado ANTES desta coluna existir nasce sem ela e só a
recebe quando alguém salvar a aba de novo, porque o save apaga e recria as
linhas.

### Destaque automático

`headlineSkin()` elege o prêmio de **maior raridade** como o destaque da
campanha. Num kit com faca, luvas e AK, quem abre a página é a luva
Extraordinária, e a moldura do bloco assume a cor dourada dela.

### Entrega na Steam

O participante cadastra o **link de troca** em `/minha-conta`. A validação
aceita apenas o formato exato que a Steam gera: um link truncado passaria
no cadastro e só falharia na hora de enviar a skin, que é o pior momento
para descobrir. Do link é derivado o **SteamID64**, útil para conferir que
o ganhador não trocou de conta entre a compra e o sorteio.

Depois do sorteio, **Admin → Entregas** lista cada campanha sorteada com o
ganhador, contato, link de troca copiável e os prêmios a enviar.

O ganhador é resolvido por `winnerTicketNumber → Ticket → Reservation → User`,
e quando esse caminho não fecha o **sorteio responde**: `Draw` guarda o
ganhador no instante em que ele saiu, e é a fonte canônica do resultado.
Título apagado ou reserva estornada deixavam a entrega órfã, exibindo "sem
link de troca" para quem tinha o link cadastrado.

Cada linha tem um **X para sair da fila** (`Raffle.entregaArquivadaEm`). Não
apaga nada: o sorteio, o ganhador e o comprovante continuam de pé, e a linha
volta pelo filtro "Removidas da fila". Existe porque fila com linha que
ninguém vai tocar esconde o que de fato falta fazer. A tela
sinaliza quem ainda não cadastrou o link e alerta quando o número
declarado não consta como vendido.

### Custo da skin e câmbio

O custo é gravado em **yuan**, que é a moeda em que a skin é comprada do
fornecedor e o único número que existiu de verdade.

Junto com ele, cada entrega guarda o **câmbio de venda do dia em que ela
saiu**: `Raffle.deliveryFxRate`, mais `deliveryFxDate` e `deliveryFxSource`,
o dia do fechamento e a origem. É essa taxa que converte aquele custo no
relatório, para sempre.

Isso não é preciosismo. Com uma taxa global única, atualizá-la reconverteria
o gasto de julho pelo câmbio de hoje, e um mês já fechado mudaria de valor
sem ninguém ter mexido nele. Com o fechamento gravado na linha, cada compra
carrega o câmbio do dia dela. Os totais somam linha a linha e nunca
convertem a soma.

**Venda, e não compra:** despesa em moeda estrangeira converte pela ponta em
que se compra a moeda para pagar.

#### Duas fontes, nessa ordem

Primeiro a [AwesomeAPI](https://awesomeapi.com.br); o
[PTAX do Banco Central](https://olinda.bcb.gov.br) atrás dela.

A ordem já foi a inversa, com a oficial na frente. Foi trocada porque **o
PTAX não publica o yuan**: em produção ele serve o dólar e devolve vazio
para CNY. Manter a fonte oficial na frente de uma moeda que ela não tem é
gastar uma ida à rede para receber nada, em toda anotação de custo. Para o
dólar o PTAX segue sendo quem responde.

Dois endpoints da AwesomeAPI, e não um: `/json/last` para o câmbio de
agora, `/json/daily` (com `start_date` e `end_date`) para uma data passada.
Usar o `daily` para perguntar o câmbio de hoje traz o fechamento de ontem,
porque o de hoje ainda não existe.

As duas usam a ponta de venda, então trocar de fonte muda a origem e não o
critério. `deliveryFxSource` grava qual respondeu: taxa sem procedência não
se reconcilia depois, e as duas moedas podem vir de lugares diferentes.

`AWESOMEAPI_TOKEN` é opcional; sem ele a resposta vem de cache de um minuto,
o que para fechamento de dia anterior dá no mesmo. A chave vai no cabeçalho
`x-api-key`, não na query, para não acabar em log de acesso.

#### Quando nenhuma fonte responde

O diálogo diz **o que cada uma respondeu**: `AwesomeAPI: HTTP 404 (par
inexistente)`, `PTAX: sem boletim para essa moeda na janela`, e assim por
diante. Antes ficava um traço, e traço não distingue 404 de timeout, moeda
inexistente ou janela sem fechamento: diagnosticar exigia acesso à rede de
produção.

#### As armadilhas, todas com teste

Do PTAX:

- a data vai em **MM-DD-YYYY**, formato americano; em `08-09` as duas
  leituras existem e nenhuma quebra, só devolvem o dia errado;
- **não há boletim em fim de semana nem feriado**, então a busca pede um
  período de 12 dias e usa o último que existir, em vez de uma ida à rede
  por dia;
- há **mais de um boletim por dia** (abertura, intermediário, fechamento), e
  o que vale é o de fechamento.

Da AwesomeAPI:

- o **timestamp vem em segundos num endpoint e em milissegundos no outro**,
  como a própria documentação mostra; ler um pelo outro joga a data para o
  ano 50 mil;
- **só o primeiro item do array** traz `code`, `codein` e `create_date`.

E de fuso, nas duas: o dia é calculado em **São Paulo**, não em UTC. Uma
entrega das 22h de Brasília é 01h UTC do dia seguinte, e em UTC pediria o
fechamento de um dia que ainda não aconteceu.

#### O custo sempre salva

Falha na busca **não impede gravar o custo**. O custo é o dado que a pessoa
tem na mão; o câmbio é conferível e dá para preencher depois. Travar o
salvamento por causa de um serviço de fora seria trocar um problema pequeno
por um grande. A linha fica sem câmbio, e o relatório diz quantos yuans
ficaram de fora em vez de mostrar um total parcial com cara de completo.

As taxas em Admin → Entregas, botão **Taxas**, são a retaguarda: valem para
linhas sem fechamento próprio. Elas se **buscam e salvam sozinhas** ao abrir
o diálogo, porque digitar taxa era trabalho que ninguém lembrava de refazer,
e taxa esquecida converte custo por um câmbio de semanas atrás.

Só o que veio é gravado: uma moeda que a fonte não trouxe **não apaga** a
taxa boa que já estava salva. Editar e salvar na mão continua valendo, para
quando a taxa real de compra for outra (spread e tarifa do fornecedor).

#### Preenchendo entregas antigas

```bash
node scripts/backfill-cambio.mjs            # ensaio, não grava
node scripts/backfill-cambio.mjs --gravar   # grava
```

Só toca em linha com custo e sem câmbio, então é retomável: rodar de novo
continua de onde parou e nunca reescreve o que já existe. Faz um pedido por
dia distinto, não por entrega, e usa a mesma ordem de fontes.

Não virou migration de propósito: migration roda em transação dentro do
build, e ir à rede lá dentro faria um serviço de fora derrubar o deploy.

### Tema

O preset `cs2` (Admin → Personalizar tema) usa o laranja do HUD do
Counter-Strike, calibrado para o modo escuro.

### Onde mexer

| Arquivo | O quê |
|---|---|
| `src/lib/cs2.ts` | Cores, rótulos, faixas de float, validação de link de troca |
| `src/components/cs2/` | `SkinCard`, `SkinHero`, selos de raridade/desgaste |
| `src/components/admin/skin-prize-editor.tsx` | Cadastro da ficha da skin |
| `src/server/services/deliveries.ts` | Fila de entregas pós-sorteio |
| `src/lib/cs2.test.ts` | Testes da lógica de domínio |

## Caixas surpresa e raspadinhas: o prêmio é decidido na compra

As duas mecânicas dividem o mesmo motor, `src/server/services/alocacao.ts`.
Não existe sorteio no clique: quando o pagamento é confirmado, as unidades
são criadas e os prêmios já são distribuídos entre elas. Abrir a caixa ou
raspar o bilhete apenas **revela** o que está gravado.

```
PAGAMENTO CONFIRMADO → combos definem a quantidade → unidades criadas →
prêmios elegíveis identificados → distribuídos entre as unidades →
gravado → o usuário abre/raspa → a tela só revela
```

O resultado não muda com a ordem de abertura, com refresh, com outro
aparelho, com requisição duplicada, nem com "abrir todas".

### Distribuição, e não chance por unidade

`src/lib/distribuicao.ts` faz amostragem sem reposição: cada unidade leva
com probabilidade `prêmios restantes ÷ unidades restantes`. Isso garante que
N prêmios elegíveis premiem exatamente N unidades, espalhadas, em vez de
saírem todos nas primeiras. Prêmios com `odds` (chance) continuam sendo
rolagem independente, aplicada depois, só nas unidades que sobraram vazias.

### Quais prêmios entram

O motor calcula quantos títulos estavam vendidos antes da compra
(`vendidosAntes`) e quantos ficaram depois (`vendidosNaSaida`), e considera
elegível todo prêmio cujo ponto de saída caiu **dentro desse intervalo**.
Quem tinha 12 vendidos e compra 25 leva tanto o prêmio de 14 quanto o de 32.
Prêmios travados (`locked`) nunca entram. `PERSONALIZADO` é resolvido aqui,
não na abertura.

### Dois cadeados, e por que são dois

| Cadeado | Chave | O que ele protege |
| --- | --- | --- |
| `alocacao` | `reservationId` | A mesma compra alocada duas vezes (webhook reentregue) |
| `alocacao:campanha` | `raffleId` | Duas compras DIFERENTES disputando os mesmos pontos de saída |

O primeiro sozinho não bastava: duas compras da mesma campanha têm chaves
diferentes e rodavam ao mesmo tempo. Ver **Ordem comercial** abaixo. A ordem
de aquisição é sempre reserva → campanha, em todos os caminhos; inverter num
lugar só bastaria para dois processos travarem um no outro.

O bolo é lido com `FOR UPDATE` (bloqueante), e não com `SKIP LOCKED`: com o
cadeado por campanha não há sobreposição a evitar, e SKIP LOCKED tinha um
preço silencioso, prêmio travado por outra transação sumia da consulta e a
compra era gravada sem ele, para sempre. `claimedAt` continua sendo a segunda
tranca.

Idempotência: `alocarPremiosDaReserva()` pode ser chamada N vezes; a segunda
não acha unidade `PENDENTE` e não escreve nada. A alocação é imutável.

### Ordem comercial: cada ponto pertence a quem o atravessou

O intervalo de uma compra sai da ORDEM DE CONFIRMAÇÃO, e não da venda no
instante em que a alocação roda:

```
40 vendidos. A compra 15, B compra 15. Prêmios em 45, 52, 58, 67.
A confirmou primeiro → atravessou 40→55 → leva 45 e 52
B confirmou depois   → atravessou 55→70 → leva 58 e 67
```

`vendidosAntes` é a soma dos títulos pagos das compras confirmadas ANTES
desta, ordenadas por `(paidAt, id)`; `vendidosNaSaida` é isso mais os títulos
da própria compra. Dois pagamentos no mesmo milissegundo continuam tendo uma
ordem objetiva e reproduzível.

A varredura de órfão (prêmio de ponto já passado que ninguém levou volta ao
bolo) fica suspensa enquanto existir, logo à frente na fila, uma compra paga
há menos de dez minutos que ainda não alocou. Sem essa trava, a compra que
rodasse primeiro levava também os pontos da que ainda estava em
processamento.

**Limite conhecido:** a ordem é a dos carimbos de pagamento, e o carimbo é
gravado antes do commit. Se o commit de uma compra anterior demorar mais que
o ciclo inteiro (confirmar + alocar) de uma posterior, a posterior não a
enxerga e pode levar o ponto dela. Fechar isso exigiria alocar dentro da
mesma transação que confirma o pagamento, o que faria uma falha de alocação
derrubar a confirmação; o custo é maior que o risco.

Revelar (`src/server/services/revelacao.ts`) é igualmente idempotente: o
update é guardado por `where: { status: "UNOPENED" }` (ou `"DISPONIVEL"`),
então a segunda requisição não escreve e devolve o mesmo resultado.

### Três estados, sem ambiguidade

`EstadoDaAlocacao` distingue o que antes era um `null` ambíguo:

| Estado | O que significa |
|---|---|
| `LEGADO` | Unidade anterior à migração. Continua sorteando na abertura, pelo caminho antigo. |
| `PENDENTE` | Criada, mas a alocação não terminou (processo interrompido). É retomada na primeira abertura ou pelo botão "Conferir e entregar". |
| `ALOCADA` | Destino gravado. Abrir só revela. |

A migração `20260901020000_estado_da_alocacao` não sorteia nada: marca como
`ALOCADA` o que já tinha prêmio ou já fora aberto, e como `LEGADO` o resto.
Nenhum histórico é reescrito e nenhuma caixa antiga fica vazia.

### O prêmio não viaja antes da revelação

Como o destino passa a existir antes do gesto, mandá-lo ao navegador
entregaria o jogo. O comprovante só serializa `prize`/`premio` depois que a
unidade saiu de `UNOPENED`/`DISPONIVEL`; a página pública mostra o prêmio
como **Reservado** (nem "Disponível", nem com o nome do ganhador) enquanto a
unidade não foi aberta.

### Onde mexer

| Arquivo | O quê |
|---|---|
| `src/lib/distribuicao.ts` | Espalhamento puro, sem banco |
| `src/server/services/alocacao.ts` | Motor compartilhado: elegibilidade, cadeado, gravação |
| `src/server/services/revelacao.ts` | Virar o status e devolver o que está gravado |
| `src/server/services/surprise-boxes.ts` | Combos e criação das caixas |
| `src/server/services/raspadinhas.ts` | Combos e criação dos bilhetes |
| `src/server/services/alocacao.integration.test.ts` | Cenários contra banco de verdade |

## Sistema de rank

Progressão por gasto, pensada para recorrência: o jogador volta porque o
próximo nível está perto e porque campanhas exclusivas dependem dele.

### A escada

**Níveis 0 a 21**, como na Gamers Club, agrupados em sete faixas nomeadas
com o vocabulário das patentes do competitivo do CS, Prata, Prata Elite,
Nova de Ouro, Mestre Guardião, Águia Lendária, Supremo e Global Elite.

A curva é quadrática (`XP_STEP * L * (L+1) / 2`): o começo é rápido e o topo
é de longo prazo.

| Nível | XP | Equivale a |
|---|---|---|
| 1 | 100 | R$ 10 |
| 5 | 1.500 | R$ 150 |
| 10 | 5.500 | R$ 550 |
| 21 | 23.100 | R$ 2.310 |

**Acima do 21**, quatro patentes de prestígio na ordem da carreira de um
profissional, primeiro você assina com uma org, depois vira lenda de Major,
depois levanta o troféu e, no fim, entra pra história:

| Patente | XP | Equivale a |
|---|---|---|
| Pro Player | 40.000 | R$ 4.000 |
| Legend | 80.000 | R$ 8.000 |
| Campeão de Major | 150.000 | R$ 15.000 |
| GOAT | 300.000 | R$ 30.000 |

Toda a escada sai de `src/lib/rank.ts`, mudar limiares, ordem ou nomes é
mexer só naquele arquivo.

### Como o XP é creditado

**10 XP por real** gasto em números pagos (ajustável por tenant em
`Tenant.xpPerBrl`). Centavos são truncados: R$ 19,90 rende os mesmos 190 XP
que R$ 19,00.

O XP **não expira e não é gasto**, o nível é permanente. Um rank que cai
puniria quem parou de comprar, que é o oposto do objetivo.

### Integridade

`XpEntry` é um extrato e a **fonte da verdade**; `UserProgress.xp` é só o
total desnormalizado, para o ranking ordenar sem varrer o extrato.

Todo crédito roda dentro de uma transação com **advisory lock por (usuário,
tenant)** e o total é **recalculado a partir do extrato** depois do insert,
nunca incrementado a partir de uma leitura anterior. Sem isso, dois
pagamentos simultâneos do mesmo usuário leem o mesmo total antigo e o segundo
apaga o crédito do primeiro.

A idempotência é feita **consultando antes de inserir**, nunca capturando a
violação do índice único: no Postgres um statement que falha aborta a
transação inteira (SQLSTATE 25P02) e os comandos seguintes são recusados.
Consultar antes é seguro porque já estamos dentro do lock. O índice único
`(userId, reason, reservationId)` fica como rede de segurança.

`src/server/services/xp.integration.test.ts` cobre exatamente esses casos
contra um Postgres real, inclusive dez créditos concorrentes e a mesma
reserva creditada cinco vezes em paralelo. Ele só roda contra banco local.

### O ranking é interno

A lista de quem mais pontuou vive **só no painel** (`/admin/ranking`), nunca
no site público. Uma vitrine de quem gasta mais é convite a engenharia
social, e o operador precisa de telefone, gasto e última compra ao lado do
XP, o que num site aberto seria vazamento.

O participante continua vendo **o próprio** progresso em `/minha-conta`:
patente, barra até o próximo degrau e extrato de XP. O que ele não vê é a
posição relativa nem quem está acima dele.

### Campanhas exclusivas

`Raffle.minLevel` (1–21) restringe a campanha a quem alcançou aquele nível;
quem está em patente de prestígio passa em qualquer exigência. É o que dá
consequência ao rank, sem isso ele seria só um selo.

O bloqueio é decidido **no servidor**, em `createReservationAction`. A página
pública apenas mostra o aviso, e ele é escrito para motivar: *"Faltam 1.500
XP, cerca de R$ 150 em outras campanhas para liberar esta."*

### Linguagem visual

**A silhueta do selo sobe junto com a faixa.** Losango na Prata, pentágono
na Prata Elite, hexágono na Nova de Ouro, heptágono no Mestre Guardião,
octógono na Águia Lendária, decágono no Supremo, e o Global Elite fecha a
escada com o mesmo decágono, mas com um anel externo destacado. O prestígio
vira roseta com brilho, claramente fora da escala.

Isso é o que faz o rank ser legível em 26px e para quem não distingue
matizes: dá para reconhecer a faixa pelo contorno, antes da cor. Cada selo é
anel colorido por fora, miolo escuro por dentro e número branco no centro.

A geometria é gerada por `polygon(sides, inset, notch)` em `rank-badge.tsx`:
o mesmo polígono percorrido com recuos diferentes vira anel, corpo e miolo,
sem empilhar máscaras. `notch` puxa os vértices ímpares para dentro e
transforma o polígono em roseta.

Supremo e Global Elite têm a mesma contagem de lados de propósito, passar de
10 para 12 lados seria indistinguível numa lista; o anel é que separa os dois.

Cada componente tem **uma cor só**, a da faixa, e a paleta é dessaturada de
propósito. Uma lista de ranking com sete cores neon vira ruído; puxada para o
sóbrio, ela informa sem gritar.

A marca do sistema é a **aresta de acento à esquerda** do painel, no lugar de
borda colorida em volta. Números sempre em `JetBrains Mono` com `tabular-nums`,
para as colunas não dançarem entre linhas.

O ranking **não tem barra de progresso**: numa lista, uma barra "até o próximo
nível" mente para o olho, o GOAT apareceria cheio e o Campeão de Major quase
vazio logo abaixo dele. Lá o que ordena é XP e posição, então é isso que a
linha mostra. A barra fica no perfil, onde significa algo.

### Onde mexer

| Arquivo | O quê |
|---|---|
| `src/lib/rank.ts` | Curva, limiares, faixas, patentes, cores |
| `src/server/services/xp.ts` | Crédito, estorno, ajuste, ranking |
| `src/components/rank/rank-badge.tsx` | Selo hexagonal e barra |
| `src/components/rank/rank-chip.tsx` | Chip do header |
| `src/components/rank/rank-card.tsx` | Cartão do perfil e escada |
| `src/components/rank/rank-row.tsx` | Linha do ranking |
| `src/app/(admin)/admin/ranking/` | Ranking (painel) |

### Ainda não implementado

- **Estorno automático.** `reverseXpForReservation` está pronta e testada,
  mas a plataforma não tem fluxo de estorno (o status `REFUNDED` existe no
  enum e nada o aplica). Quando existir, chame a função no mesmo ponto.
- **Pontos gastáveis.** O SKNRS separa `xp` (permanente, define o nível) de
  `balance` (gastável, resgatável). Aqui só existe o XP. O extrato já
  comporta a segunda moeda quando fizer sentido.

## Dívida técnica conhecida

Coisas que a tela oferece e o sistema não cumpre. Estão aqui porque decidir
o que elas devem fazer é decisão de produto, não de código, e um interruptor
que não faz nada é pior calado do que anotado.

| Onde | O que acontece hoje |
| --- | --- |
| `Raffle.showOnHome` | O campo existe, o painel liga e desliga, e a home não usa. A listagem da home tem regra própria. Ou a home passa a respeitar o campo, ou o interruptor sai da tela. |
| `Raffle.allowReceiptDownload` | Mesma coisa: gravado, editável, e nenhuma tela oferece download de comprovante. |

## Programa de afiliados

Quem indica ganha **Cupom de Entrada**, e não dinheiro. Por padrão:

```
A cada R$ 10,00 pagos pelos indicados → 1 Cupom de Entrada de R$ 5,00
                                        (50% de recompensa)
```

Progressivo: R$ 27,50 dão dois cupons e deixam R$ 7,50 guardados; os R$ 2,50
seguintes fecham o terceiro. **Todos os indicados do mesmo afiliado somam no
mesmo progresso**, e o mesmo indicado contribui quantas vezes comprar.

### Dois modos de recompensa

`Affiliate.modoDeRecompensa` escolhe de onde sai a porcentagem:

- **`VALOR_FIXO`** (padrão): a porcentagem é digitada uma vez e vale para todo
  mundo. É a regra descrita acima.
- **`PERCENTUAL_PROGRESSIVO`**: a porcentagem sai do **gasto acumulado de cada
  indicado**, e sobe de degrau em degrau:

```
degraus    = floor(gastoAcumuladoDoIndicado / degrauEmCentavos)
porcentagem = degraus × bpsPorDegrau

R$ 0 a 99,99 → 0%   R$ 100 → 2%   R$ 199,99 → 2%
R$ 200 → 4%         R$ 250 → 4%   R$ 300 → 6%     R$ 500 → 10%
```

Sem arredondamento para cima: R$ 199,99 está no mesmo degrau de R$ 100. Os dois
parâmetros são configuráveis (`degrauEmCentavos`, `bpsPorDegrau`), então "a cada
R$ 200 → +1%" é configuração, e não código novo. A conta é
`progressaoDoIndicado` em `lib/afiliados.ts`, e ela devolve os números da
auditoria de uma vez: gasto, degraus, porcentagem, próximo degrau e quanto
falta. É a mesma função que a tela do afiliado usa por indicado, para o painel
nunca contar uma história diferente da concessão.

Indicado abaixo do primeiro degrau não gera cupom, **e o progresso não é
consumido**: fica guardado inteiro e converte quando a porcentagem deixar de ser
zero, para nenhum dinheiro real se perder no caminho.

### Configurável por afiliado

Modo, limiar, porcentagem, valor do cupom, degrau e aumento por degrau ficam em
`Affiliate`, e cada afiliado pode ter os seus (painel → Afiliados →
Configuração de recompensa). Sem configuração própria, valem os padrões globais
de `lib/afiliados.ts`.

### O cupom vale 72 horas

`EntradaGratis.expiraEm` nasce em `ganhaEm + 72h`, e a tela mostra a contagem
regressiva ao lado do valor (vermelha nas últimas 12 horas). O prazo existe
para o cupom virar movimento: cupom sem validade vira crédito parado que a
pessoa lembra seis meses depois.

O vencimento é decidido comparando a coluna com o relógio, e não por um estado
que alguém precisa vir marcar: sem job que rode, um cupom vencido continuaria
DISPONIVEL e gastável. A condição mora em `cupomUsavel()`, usada no painel e
no checkout, e o `FOR UPDATE` da compra confere o prazo DENTRO da trava, senão
sobra a janela de gastar um cupom que venceu entre a tela e o clique.

Prazo **nulo** é cupom sem validade, e não cupom vencido: é assim que ficam os
concedidos antes desta regra e os ajustes manuais do painel, que não deviam
morrer sozinhos. Cupom vencido não é apagado, fica no banco fora do prazo.

### O que o afiliado vê dos indicados

Nome mascarado ("Marcos R."), desde quando, e uma BARRA de quanto falta para
fechar o cupom. Quem já fechou fica com a barra cheia e verde, e ela não volta
a zero: a barra conta a história daquela indicação ("deu certo"), e não o
ciclo de compras dela. O valor gasto por cada pessoa não aparece, e não sai
do servidor nem escondido no HTML: quem mandou o link não vira dono da vida
financeira de quem clicou. `indicadosDoAfiliado` devolve porcentagem do ciclo
atual e um booleano de "já rendeu", e nunca centavos.

O booleano é de propósito, e não uma contagem: "fechou 34 ciclos de R$ 10" é o
valor gasto escrito de outro jeito, e teria desfeito no rodapé o que a barra
protege.

### O link cai direto no cadastro

O link que o painel gera é sempre a raiz com `?ref=CODIGO`, e é ele que o
afiliado manda no grupo. Quem clica quase nunca tem conta, e a home não pede
cadastro em lugar nenhum: a pessoa olhava as campanhas e ia embora sem virar
conta, que é o único jeito de o vínculo existir.

Agora o proxy desvia esse clique para `/registro?ref=CODIGO`, e o campo de
código chega **preenchido e travado**: o vínculo foi decidido no clique, e
deixá-lo editável só abriria caminho para apagar sem querer o crédito de quem
trouxe a pessoa. O código vai na URL e no cookie, então navegador que recusa
cookie continua funcionando, e quem clicou hoje e só voltou para criar conta
semana que vem também encontra o campo preenchido.

Só a RAIZ desvia. Link de campanha com `?ref` montado à mão continua abrindo a
campanha, e quem já tem sessão aberta não é empurrado para lugar nenhum.

A porcentagem é guardada em **basis points** inteiros (5000 = 50%, 7000 = 70%),
e nunca em float: porcentagem em ponto flutuante erra centavo. O valor do cupom
é DERIVADO no servidor (`floor(limiar × bps / 10000)`), e o que a tela mandou é
só conferido: divergir significa recusar, porque cupom valendo diferente do que
o painel prometeu é o tipo de erro que só aparece na reclamação.

**Mudar a configuração não reescreve o passado.** Cada cupom guarda o próprio
valor de face e a configuração que o originou (`valorEmCentavos`,
`limiarNaConcessao`, `bpsNaConcessao`). Trocar a recompensa para R$ 7 hoje deixa
os cupons de R$ 5 valendo R$ 5. O de-para fica no histórico, com o admin
responsável.

### Como o cupom é usado

Abate **até o valor de face**, em UMA cota:

| Cota | Cupom | Abate | Paga | Sobra |
| --- | --- | --- | --- | --- |
| R$ 2 | R$ 5 | R$ 2 | R$ 0 | **perde R$ 3** |
| R$ 5 | R$ 5 | R$ 5 | R$ 0 | — |
| R$ 12 | R$ 5 | R$ 5 | R$ 7 | — |

Sem troco, sem saldo, sem dividir entre cotas, sem somar dois cupons. Quatro
cotas de R$ 2 recebem R$ 2 de desconto, e não R$ 8. A tela avisa a perda antes
de confirmar, e quem tem cupons de valores diferentes **escolhe qual usar**: a
tela não escolhe o de maior valor sozinha.

Vale **um cupom por sorteio**, garantido por `unique(affiliateId, raffleId)`.
Campanha decide se aceita, em `Raffle.aceitaCupomDeAfiliado`; não existe teto de
preço de cota.

### As peças

| Onde | O quê |
| --- | --- |
| `src/lib/afiliados.ts` | Regra pura: recompensa, valor do cupom, bps, desconto |
| `src/server/services/afiliados.ts` | O motor: vínculo, progresso, cupons, painel, config |
| `src/server/actions/afiliados.ts` | As portas, incluindo "quero ser afiliado" |
| `src/proxy.ts` | Guarda o `?ref=` num cookie próprio de 30 dias |
| `src/app/(public)/minha-conta/afiliados` | O painel de quem divulga |
| `src/app/(admin)/admin/afiliados` | A gestão e a configuração de recompensa |
| `scripts/censo-de-afiliados.mjs` | Contagem só-leitura, para antes de migrar |
| `scripts/resetar-faturamento.mjs` | Zera o faturamento. Censo por padrão, apaga só com `--aplicar` |

### O que garante que a conta fecha

- **Idempotência por pagamento.** `MovimentoDeAfiliado` tem
  `unique(reservationId, tipo)`: webhook reentregue esbarra no índice e o mesmo
  dinheiro não entra duas vezes no progresso.
- **Progresso serializado.** Cada crédito roda sob
  `pg_advisory_xact_lock('afiliado', affiliateId)`, então pagamentos
  simultâneos somam em vez de competir.
- **Só dinheiro real.** O progresso vem de `totalAmount`, que já nasce
  descontado do cupom aplicado: compra de R$ 12 com cupom de R$ 5 soma R$ 7, e
  compra inteiramente coberta soma zero.
- **Cupom pertence a quem usa.** O id vem da tela, mas a reivindicação exige
  `affiliateId` + `estado = DISPONIVEL` + `FOR UPDATE`: id de outra conta não
  encontra linha.

### Estados do cupom

`DISPONIVEL` → `RESERVADA` (Pix pendente) → `USADA`. Pix expirado devolve ao
saldo. `CANCELADA` é o recolhido por estorno.

### Estorno

O valor sai do progresso. Se ficar negativo, cupons ainda disponíveis são
cancelados para cobrir, um por limiar. O que sobrar de dívida fica como
**progresso negativo**, de propósito: cupom já usado não é apagado (a cota
existiu), e fingir que a conta fechou seria perdoar o estorno em silêncio. O
número negativo aparece só no painel administrativo, e o próximo dinheiro real
quita a dívida antes de gerar cupom novo.

### Ativação e privacidade

Qualquer conta autenticada entra num clique, sem aprovação, e a ativação não
concede cupom. O afiliado vê o primeiro nome com a inicial do sobrenome
("Mateus N.") e quanto cada indicado pagou; telefone, CPF e e-mail não saem do
servidor.

### A largura do conteúdo é uma só

`ContainerPublico` (`components/public/container.tsx`). Cada página tinha a
sua: a home em 4xl dentro de 6xl, "sorteios" e "meus títulos" em 3xl, "minha
conta" e "afiliados" em 5xl. Navegar entre elas fazia o conteúdo estreitar e
alargar a cada clique, e o cabeçalho, que é o mesmo em todas, ficava com
margens que não batiam com nada abaixo dele.

A medida vem da home. São duas caixas e não uma: a de fora segura o respiro
lateral, a de dentro limita a linha de leitura. Com uma só, o `px-4` entraria
na conta do máximo e o conteúdo ficaria 32px mais estreito que na home.

A página da campanha (`/[slug]`) fica de fora e continua estreita
(`max-w-md`, `md:max-w-2xl`): ali o que manda é o formulário de compra, que
lê melhor numa coluna só.

## Sorteio ao vivo

O resultado deixou de ser digitado no painel. Quando a campanha encerra
sozinha, o sistema cria um `Draw`, transmite a contagem e o sorteio numa
página pública, e grava o ganhador com comprovante. Ninguém escolhe o número:
`setRaffleWinnerAction` passa a recusar campanha que tenha `Draw`.

**A ideia que sustenta tudo:** no instante do encerramento, o cronograma
INTEIRO é calculado e gravado. Quando a contagem começa, quando ela zera,
quando o número pode aparecer e quando o nome pode aparecer, tudo em colunas
`TIMESTAMP`. Daí saem três propriedades de graça:

- **Sobrevive a restart, deploy e autoscale.** O estado não mora na memória
  de ninguém; qualquer processo que acorde reconstrói a fase pelos carimbos.
- **Dispensa servidor de eventos.** A página recebe o cronograma na primeira
  resposta e conta sozinha. São de três a cinco requisições por espectador na
  transmissão inteira (medido), uma por virada de fase.
- **Todo mundo vê a mesma coisa.** A contagem é calculada contra o relógio do
  SERVIDOR, reconstruído no cliente pela diferença medida na ida e volta.

### As peças

| Onde | O quê |
| --- | --- |
| `src/lib/sorteio-ao-vivo.ts` | A linha do tempo, pura e testada. Fases, marcos, formatação, código público. |
| `src/lib/sorteio-justo.ts` | O sorteio verificável: compromisso, manifesto, HMAC e conferência. Roda igual no servidor e no navegador. |
| `src/server/services/sorteio-ao-vivo.ts` | O motor: agenda, sorteia, avança fase, monta o estado público. |
| `src/app/api/sorteio/[publicId]/estado` | O estado. Chamada nas viradas de fase; avança a máquina de quebra. |
| `src/app/api/cron/sorteios` | A rede de proteção, de minuto em minuto. |
| `src/app/(public)/sorteio/[publicId]` | A transmissão e, depois, o comprovante permanente. |
| `src/app/(public)/sorteio/[publicId]/verificar` | A conferência, feita no navegador de quem abre. |
| `src/app/api/sorteio/[publicId]/manifesto` | A lista de títulos que disputaram. Só números, nunca gente. |
| `src/app/(admin)/admin/sorteios/[id]/sorteio` | O acompanhamento, só de leitura. |

### Troféu da tela de sorteio

Uma imagem pequena, opcional, exibida ao lado do texto "Número sorteado" na
transmissão (24 a 32px, `object-contain`, nunca esticada).

O troféu é do SITE, e não da campanha: `Tenant.trofeuUrl`, em Configurações →
Geral. Quem assiste vê a mesma cena toda semana, e exigir upload por campanha
era trabalho que só existia para ser esquecido no dia em que o sorteio ia ao
ar. `Raffle.trofeuUrl` continua existindo e GANHA do padrão, para variar num
sorteio específico (editor do sorteio, aba Imagens).

Vazio nos dois lugares não desenha nada, nem placeholder nem imagem padrão. Os
dois usam o mesmo caminho de armazenamento das outras imagens: no banco vai só
a URL.

### Quando uma campanha encerra

Duas condições, checadas pelo cron: vendeu todos os títulos, ou passou da
`drawDate` com `autoCloseOnDraw` ligado. Campanha sem uma venda sequer não
gera sorteio, e continua `ACTIVE`. No mesmo instante em que o `Draw` nasce, a
campanha vira `FINISHED` na MESMA transação, e é isso que congela o universo:
`createReservation` já recusa campanha que não esteja `ACTIVE`.

### O número: verificável, não só imprevisível

O sorteio não usa sorteador. Ele é uma conta que qualquer pessoa refaz, com
compromisso e revelação (`src/lib/sorteio-justo.ts`):

1. **Na criação da campanha**, o sistema sorteia uma chave secreta de 32 bytes
   e publica só o SHA-256 dela. O hash aparece na página da campanha enquanto
   as cotas são vendidas.
2. **No encerramento**, a lista de títulos elegíveis vira o manifesto (ordem
   crescente, um por linha) e o SHA-256 dela é o segundo ingrediente.
3. **O vencedor** é `HMAC-SHA256(chave, "manifesto:nonce")`, lido como inteiro
   de 256 bits, módulo a quantidade de títulos.
4. **Na revelação**, a chave é publicada.

A ORDEM é o que dá valor a isso. O compromisso sai antes de existir manifesto:
se a chave fosse escolhida depois do encerramento, quem opera o site já saberia
quem está no bolo e poderia gerar mil chaves até achar a que faz ganhar quem
ele quer, publicando só o hash escolhido. Travando antes da primeira venda,
essa escolha deixa de existir.

A chave secreta vive em `DrawSeed`, tabela própria: meia dúzia de lugares deste
código fazem `raffle.findUnique` sem `select` e entregam a linha inteira para
componente de cliente, e uma coluna secreta ali iria para o navegador em
silêncio.

Elegível é título vendido (`PAID` e `AWARDED`, a mesma definição da barra de
progresso). Sortear no intervalo cheio cairia em número sem dono numa campanha
que encerrou pela data com metade vendida.

O resultado é gravado antes de a animação começar. O carretel na tela é
enfeite: `CarretelDeTitulos` gira enquanto o número real é nulo e para quando
ele chega. Não existe caminho em que o que está na tela vire o resultado.

### A página de conferência

`/sorteio/<id>/verificar` refaz o sorteio **no navegador de quem abriu**, com
o mesmo módulo que o servidor usou para sortear (Web Crypto, uma implementação
só para os dois lados). Ela baixa a lista de títulos de
`/api/sorteio/<id>/manifesto`, recalcula o hash, recalcula o HMAC, e mostra
sete checagens em português.

Testado adulterando o banco: trocando o número vencedor depois do sorteio, seis
checagens continuam verdes e só "o título vencedor é o que está nessa posição"
reprova, apontando exatamente para o que foi mexido.

`crypto.subtle` só existe em contexto seguro (https ou localhost). Fora disso a
página diz isso em português em vez de morrer com erro em inglês.

### Idempotência

Nenhuma transição é "ler, decidir, escrever". Toda mudança de fase é um
`UPDATE ... WHERE status = <anterior>`, e quem consegue mudar a linha é quem
faz o trabalho. `Draw.raffleId` é único, então dois workers que acordem juntos
produzem um sorteio só, o segundo levando erro de chave duplicada. Há teste de
integração para as duas corridas.

### Tempos

Server-side, sem prefixo `NEXT_PUBLIC_`: o navegador não vê e não tem como
encurtar a própria contagem.

| Variável | Produção | Para testar |
| --- | --- | --- |
| `DRAW_WAIT_SECONDS` | 600 | 10 |
| `DRAW_COUNTDOWN_SECONDS` | 60 | 10 |
| `DRAW_ROLLING_SECONDS` | 9 | 5 |
| `DRAW_WINNER_SECONDS` | 4 | 2 |

Localmente: suba com os valores curtos, venda todos os títulos de uma
campanha e chame `GET /api/cron/sorteios` uma vez. Em produção o cron da
Vercel faz isso sozinho a cada minuto, autenticado por `CRON_SECRET`.

### Som

A transmissão tem quatro momentos com som: cada segundo da contagem, os dez
segundos finais, o giro dos títulos e o número aparecendo. Todos nascem
sintetizados por oscilador, com zero bytes de download, e é assim que ficam
enquanto ninguém mexer.

Em **Configurações → Som do sorteio**, o painel troca cada momento por um
arquivo próprio (MP3, M4A, AAC, OGG, WAV ou WEBM, até 2 MB) e pode desligar
o som inteiro. Momento sem arquivo continua no oscilador, então a
transmissão nunca fica muda por falta de upload.

A regra do giro é diferente das outras três de propósito: o arquivo toca em
repetição do começo do giro até o número aparecer, e para sozinho. É onde
cabe a trilha de suspense; disparar um arquivo a cada título que passa
viraria ruído sobreposto.

Nada toca sozinho. Navegador nenhum permite áudio antes de um gesto, então o
som nasce desligado e quem assiste liga no botão de alto-falante, que é onde
os arquivos são criados e destravados. Desligado no painel, o botão nem
aparece. E o som segue sendo decoração: tudo o que ele diz, a tela também
diz.

## Pré-requisitos

- **Node.js 20.19+ ou 22+** (atualmente Node 20.18.1 está instalado, recomendo atualizar)
- npm 10+
- Conta no [Supabase](https://supabase.com) com um projeto criado
- (Opcional para Fase 1) Contas em: Mercado Pago, Resend, Upstash, Inngest

## Setup local, passo a passo

### 1. Clone e instale dependências

```bash
git clone <repo-url> queotaskin
cd queotaskin
npm install
```

### 2. Configure variáveis de ambiente

Copie o `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Mínimo necessário pra rodar a Fase 1:

- `DATABASE_URL`, string com pooler do Supabase (porta 6543)
- `DIRECT_URL`, string sem pooler (porta 5432), usada pelo Prisma para migrations
- `AUTH_SECRET`, gere com `openssl rand -base64 32` ou `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `AUTH_URL`, em dev: `http://localhost:3000`
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, credenciais do admin criado pelo seed

Encontre as strings do Supabase em **Project Settings → Database → Connection string**.

### 3. Crie as tabelas no banco

```bash
npm run db:migrate
```

Isso roda `prisma migrate dev`, que:
1. Lê `prisma/schema.prisma`
2. Compara com o estado atual do banco
3. Cria um arquivo de migration em `prisma/migrations/`
4. Aplica no banco

Da primeira vez, ele vai pedir um nome pra migration (algo como `init`).

### 4. Popule com dados iniciais

```bash
npm run db:seed
```

Cria:
- 1 usuário **ADMIN** (credenciais vêm das envs `SEED_ADMIN_*`)
- 1 rifa de exemplo em `/sorteios/rifa-exemplo`
- Linha de `SiteSettings` (singleton)

### 5. Rode o servidor de dev

```bash
npm run dev
```

Acesse:
- Site público: <http://localhost:3000>
- Login: <http://localhost:3000/login>
- Admin: <http://localhost:3000/admin> (logue com o admin do seed)

## Scripts úteis

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Roda o build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verifica tipos sem gerar saída |
| `npm test` | Roda Vitest |
| `npm run test:watch` | Vitest em modo watch |
| `npm run db:generate` | Gera o cliente Prisma a partir do schema |
| `npm run db:migrate` | Cria + aplica migration (dev) |
| `npm run db:migrate:deploy` | Aplica migrations já existentes (prod) |
| `npm run db:reset` | **APAGA** o banco e re-aplica migrations + seed |
| `npm run db:seed` | Popula com dados iniciais |
| `npm run db:studio` | UI visual do Prisma para inspecionar dados |

## Estrutura

```
src/
  app/
    (public)/          # site público
      page.tsx           → home
      sorteios/
        page.tsx         → lista de sorteios
        [slug]/page.tsx  → detalhe + form de reserva
      comprovante/[reservationId]/page.tsx
    (auth)/
      login/page.tsx
      registro/page.tsx
    (admin)/
      admin/
        layout.tsx       → sidebar + auth guard
        page.tsx         → dashboard
        sorteios/
          page.tsx       → listagem
          novo/page.tsx
          [id]/editar/page.tsx
    api/
      auth/[...nextauth]/route.ts
      cron/expire-reservations/route.ts
  auth.config.ts       # config edge-safe (middleware)
  auth.ts              # config completa (Prisma + bcrypt)
  middleware.ts        # roteia auth nas requests
  components/
    ui/                # shadcn primitives
    public/            # header, reservation form
    admin/             # raffle form, status actions
    forms/             # login, register
  lib/
    db.ts              # Prisma client singleton
    auth-helpers.ts    # requireAuth, requireAdmin
    cpf.ts             # validação + format
    slug.ts
    format.ts          # BRL, datas
    errors.ts          # erros de domínio
    validations/       # schemas Zod
  server/
    actions/           # Server Actions (auth, raffles, reservations)
    services/          # lógica de negócio (raffles, reservations)
prisma/
  schema.prisma
  seed.ts
```

## Decisões importantes

### Modelo de Tickets "Lazy"
A tabela `Ticket` **não** recebe uma linha por número quando a rifa é criada. Numa rifa de 1 milhão de números, isso seria absurdo. Em vez disso, só inserimos uma linha quando o número é reservado/pago. A ausência de linha = número AVAILABLE.

O `@@unique([raffleId, number])` é o que garante que dois usuários simultâneos não consigam reservar o mesmo número, o segundo INSERT falha com erro de constraint, a transação rolla, e o sistema avisa o usuário.

### Auth com 2 arquivos (edge-safe + Node)
O middleware do Next.js roda em edge runtime, onde Prisma e bcrypt não funcionam. Por isso a config do NextAuth é dividida:
- `auth.config.ts`, só callbacks e rotas, sem Prisma. Usado pelo middleware.
- `auth.ts`, config completa com adapter Prisma e provider Credentials. Usado pelas Server Actions.

### Server Actions vs API Routes
- **Server Actions** para tudo que vem de formulários do app (login, registro, criação de rifa, reserva).
- **API Routes** apenas para webhooks (Mercado Pago) e callbacks externos (NextAuth, Cron).

### Concorrência segura na reserva
A função `createReservation` em `src/server/services/reservations.ts` usa uma transação Prisma com `createMany`. Se qualquer ticket colidir, a transação rolla e devolvemos um `ReservationConflictError` listando os números que estão em conflito.

### CPF como dígitos
CPF é armazenado somente como 11 dígitos (sem ponto/traço). A formatação fica na camada de UI via `formatCpf()`.

## Fases do projeto

- **Fase 1 (MVP, atual)**: auth + admin de rifas (aba Geral) + público + reserva sem pagamento + expiração via cron.
- **Fase 2**: Mercado Pago (Checkout Pro + Pix) + webhooks + PDF de comprovante + email transacional (Resend) + upload de imagens (Supabase Storage) + aba Imagens no admin.
- **Fase 3**: Sorteio baseado em Loteria Federal + sorteio próprio com semente verificável + página de resultados.
- **Fase 4**: Afiliados + comissões + promoções/combos + links UTM/desconto.
- **Fase 5**: Restante do admin (FAQ, anúncios, termos, privacidade, sobre, temas, relatórios) + filantropia.

## Segurança

- Senhas: bcrypt cost 12.
- Validação dupla: cliente (UX) + servidor (Zod em toda Server Action).
- CSRF: protegido nativamente pelas Server Actions do Next.js.
- SQL Injection: impossível via Prisma (queries parametrizadas).
- Webhooks: HMAC do Mercado Pago será validado na Fase 2.
- Idempotência: tabela `PaymentWebhookEvent` com `@@unique([provider, externalId])`.
- Rate limit: a wirar com Upstash Redis em endpoints públicos.
- Cron: header `Authorization: Bearer $CRON_SECRET` exigido.
- LGPD: dados pessoais (CPF, telefone) tratados explicitamente; usuário pode (Fase 5) solicitar exclusão.

## Deploy

A aplicação é compatível com Vercel. Para deployar:

1. Conecte o repo no Vercel.
2. Configure as envs (todas do `.env.example`) em **Project Settings → Environment Variables**.
3. O Vercel detecta Next.js automaticamente.
4. Em **Functions**, garanta que `CRON_SECRET` esteja setado, o Vercel Cron usa pra autenticar.
5. O `vercel.json` declara o cron a cada 5 min para expirar reservas.

## Licença

Privada, uso interno.
