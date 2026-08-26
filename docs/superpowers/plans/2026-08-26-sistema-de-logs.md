# Sistema de registro de atividade: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao painel uma memória append-only de quem fez o quê, cobrindo as ações de administração e o ciclo de dinheiro, consultável em `/admin/logs`.

**Architecture:** Uma tabela `ActivityLog` com o ator congelado (nome, papel e e-mail copiados no momento do ato, sem foreign key para `User`), escrita por um único serviço `registrarLog()` chamado explicitamente nos pontos que importam. O catálogo de ações é uma união de strings tipada, então o TypeScript recusa ação fora do catálogo e a tela sabe desenhar cada uma. O serviço nunca lança: um registro que falha não pode derrubar a venda que ele registrava.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript strict, Prisma 6 sobre PostgreSQL, Auth.js v5, Vitest, Tailwind e shadcn/ui.

**Spec:** [docs/superpowers/specs/2026-08-26-sistema-de-logs-design.md](../specs/2026-08-26-sistema-de-logs-design.md)

## Global Constraints

- **Nunca use `prisma migrate dev` nesta máquina.** O `DATABASE_URL` do `.env` aponta para o Supabase de **produção**. `migrate dev` compara o histórico com o banco e, ao detectar divergência, oferece resetar, o que apagaria o banco real. A migration deste plano é escrita à mão em SQL e aplicada pelo deploy (`scripts/migrate-deploy.mjs` roda `migrate deploy`, que só aplica o que falta e nunca reseta). Para testar localmente, suba um Postgres próprio e aponte `DATABASE_URL` para ele.
- **Proibido travessão (`—`) em qualquer arquivo dentro de `src/`.** O teste `src/lib/sem-travessao.test.ts` reprova o build. Use dois-pontos, vírgula ou parênteses.
- Comentários, mensagens de erro e textos de interface em **português**, no tom explicativo já usado no repositório: o comentário diz por que, não o que.
- `registrarLog()` **nunca lança**. Todo o corpo vive num `try/catch` que termina em `console.error`.
- **Segredo nunca entra em `detalhes`**, nem no lado "antes": credencial de gateway, senha temporária, hash. **CPF entra mascarado** (`***.***.777-35`).
- `headers()` do `next/headers` é **assíncrono** no Next 16: sempre `await headers()`.
- Antes de cada commit: `npm run typecheck` e `npx vitest run` precisam passar.
- Testes de integração seguem o padrão de `src/server/services/xp.integration.test.ts`: pulam sozinhos quando `DATABASE_URL` não aponta para `localhost`. Nesta máquina eles **vão pular**, e isso é proposital.
- Não abrir nem mergear PR sem o usuário pedir.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/activity-log-actions.ts` | Catálogo de ações e tipos. Puro, sem banco. |
| `src/lib/activity-log-detalhes.ts` | Monta o campo `detalhes`: calcula o que mudou e remove segredo e PII. Puro. |
| `src/server/services/activity-log.ts` | Escrita: `registrarLog()` e a resolução do ator pela sessão. |
| `src/server/services/activity-log-query.ts` | Leitura e manutenção: `montarWhere()`, `listarLogs()`, `limparLogsAntigos()`. |
| `src/app/(admin)/admin/logs/page.tsx` | A tela. |
| `src/components/admin/logs/lista-de-logs.tsx` | Linha e detalhe expansível. |
| `prisma/schema.prisma` | Modelo `ActivityLog` e enum `LogOrigin`. |

Leitura e escrita ficam em arquivos separados de propósito: a escrita é importada por quase toda server action do projeto, e não deve arrastar junto o código de consulta e paginação que só a tela usa.

---

### Task 1: Modelo e migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260826200000_registro_de_atividade/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: o modelo `ActivityLog` e o enum `LogOrigin` no client do Prisma. Campos: `id`, `tenantId`, `origem`, `actorId`, `actorName`, `actorRole`, `actorEmail`, `acao`, `alvoTipo`, `alvoId`, `alvoRotulo`, `detalhes`, `ip`, `criadoEm`.

- [ ] **Step 1: Adicionar o enum e o modelo ao schema**

No fim de `prisma/schema.prisma`:

```prisma
/// De onde a ação partiu. Separado de quem agiu de propósito: a troca do link
/// da Steam tem ator de sessão e origem PUBLICO ao mesmo tempo.
enum LogOrigin {
  PAINEL // alguém clicou no admin
  SISTEMA // webhook de gateway, cron
  PUBLICO // ação do participante no site
}

/// Registro append-only do que aconteceu. O código nunca dá update aqui, e a
/// interface não oferece exclusão; a única escrita destrutiva é a limpeza por
/// idade em activity-log-query.ts.
model ActivityLog {
  id String @id @default(cuid())

  /// Painel a que o registro pertence. Nulo só em evento sem tenant
  /// resolvido, como a varredura global do cron.
  tenantId String?
  tenant   Tenant? @relation("TenantActivityLogs", fields: [tenantId], references: [id], onDelete: Cascade)

  origem LogOrigin @default(PAINEL)

  /// Ator CONGELADO, não por relação, e essa é a decisão central do modelo.
  /// Uma foreign key para User faria o histórico depender de a conta
  /// continuar existindo e com o mesmo nome, quando o caso que mais interessa
  /// é justamente o da conta removida ou renomeada depois do ato.
  actorId    String?
  actorName  String
  actorRole  Role?
  actorEmail String?

  /// Chave do catálogo em src/lib/activity-log-actions.ts.
  acao String

  /// Alvo, para responder "tudo que aconteceu com este sorteio". O rótulo
  /// também é congelado, pelo mesmo motivo do ator.
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

- [ ] **Step 2: Adicionar o lado de volta da relação em `Tenant`**

No modelo `Tenant`, junto das outras listas de relação (perto de `skinTemplates SkinTemplate[]`):

```prisma
  activityLogs ActivityLog[] @relation("TenantActivityLogs")
```

- [ ] **Step 3: Validar o schema**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid`

Se falhar por relação sem par, o Step 2 não foi aplicado no modelo certo.

- [ ] **Step 4: Escrever a migration à mão**

Crie `prisma/migrations/20260826200000_registro_de_atividade/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "LogOrigin" AS ENUM ('PAINEL', 'SISTEMA', 'PUBLICO');

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "origem" "LogOrigin" NOT NULL DEFAULT 'PAINEL',
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" "Role",
    "actorEmail" TEXT,
    "acao" TEXT NOT NULL,
    "alvoTipo" TEXT,
    "alvoId" TEXT,
    "alvoRotulo" TEXT,
    "detalhes" JSONB,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_tenantId_criadoEm_idx" ON "ActivityLog"("tenantId", "criadoEm");

-- CreateIndex
CREATE INDEX "ActivityLog_alvoTipo_alvoId_idx" ON "ActivityLog"("alvoTipo", "alvoId");

-- CreateIndex
CREATE INDEX "ActivityLog_acao_criadoEm_idx" ON "ActivityLog"("acao", "criadoEm");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_criadoEm_idx" ON "ActivityLog"("actorId", "criadoEm");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

O nome do diretório precisa ser maior que o da última migration existente (`20260826180000_texto_de_inicio`), senão o Prisma aplica fora de ordem.

- [ ] **Step 5: Conferir que a migration bate com o schema**

Run: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code`

Se não houver um Postgres para banco sombra à disposição, pule este passo e confira o SQL à mão contra o Step 1: cada campo do modelo tem coluna, cada `@@index` tem `CREATE INDEX`, e o `onDelete: Cascade` virou `ON DELETE CASCADE`.

Expected: sem diferenças (código de saída 0).

- [ ] **Step 6: Gerar o client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`

Depois disso `prisma.activityLog` existe com tipos. Sem este passo, todas as tasks seguintes falham no typecheck com "Property 'activityLog' does not exist".

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: sem saída de erro.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260826200000_registro_de_atividade
git commit -m "feat: tabela de registro de atividade, com o ator congelado"
```

---

### Task 2: Catálogo de ações

**Files:**
- Create: `src/lib/activity-log-actions.ts`
- Test: `src/lib/activity-log-actions.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ACOES` (objeto constante), `type AcaoDeLog = keyof typeof ACOES`, `type TipoDeAlvo`, `textoDaAcao(acao: string): string`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/lib/activity-log-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ACOES, textoDaAcao } from "./activity-log-actions";

describe("catálogo de ações", () => {
  it("toda chave tem texto, senão a tela mostra linha em branco", () => {
    for (const [chave, texto] of Object.entries(ACOES)) {
      expect(texto, `ação sem texto: ${chave}`).toBeTruthy();
    }
  });

  it("toda chave segue o formato dominio.acao, que é como o filtro agrupa", () => {
    for (const chave of Object.keys(ACOES)) {
      expect(chave, `chave fora do formato: ${chave}`).toMatch(
        /^[a-z]+\.[a-z_]+$/
      );
    }
  });

  it("traduz a chave para o texto do catálogo", () => {
    expect(textoDaAcao("usuario.papel_alterado")).toBe("mudou o papel de");
  });

  it("ação desconhecida devolve a própria chave, não vazio", () => {
    // Registro antigo de uma ação que foi renomeada continua no banco. Cair
    // em string vazia sumiria com a linha inteira da tela justo quando
    // alguém foi procurar o histórico.
    expect(textoDaAcao("sumiu.do_catalogo")).toBe("sumiu.do_catalogo");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/activity-log-actions.test.ts`
Expected: FAIL, `Failed to resolve import "./activity-log-actions"`.

- [ ] **Step 3: Escrever o catálogo**

Crie `src/lib/activity-log-actions.ts`:

```ts
// Catálogo das ações que o sistema registra.
//
// É união de strings, e não string livre, por dois motivos. O TypeScript
// recusa ação inventada na hora de chamar registrarLog, então uma action nova
// não entra no banco com chave torta. E a tela monta a frase a partir daqui,
// então o texto vive num lugar só, em vez de espalhado por vinte chamadas.
//
// A granularidade é desigual de propósito. raffle-content.ts exporta quatorze
// actions (capa, imagens, prêmios, promoções, títulos premiados, combos e
// prêmios de caixa surpresa, provedor de pagamento). Todas entram como
// sorteio.conteudo_alterado, com detalhes.o_que nomeando a parte que mudou:
// uma chave por action encheria o catálogo e o filtro sem responder nada que
// o_que não responda.
//
// Declarar e remover ganhador são a exceção, porque decidem quem recebe uma
// skin.

export const ACOES = {
  "painel.login": "entrou no painel",
  "painel.login_recusado": "teve a entrada recusada",
  "usuario.criado": "criou a conta",
  "usuario.editado": "editou os dados de",
  "usuario.papel_alterado": "mudou o papel de",
  "usuario.senha_gerada": "gerou senha de painel para",
  "usuario.trade_url_alterada": "trocou o link de troca da Steam",
  "sorteio.criado": "criou o sorteio",
  "sorteio.editado": "editou o sorteio",
  "sorteio.duplicado": "duplicou o sorteio",
  "sorteio.status_alterado": "mudou o status do sorteio",
  "sorteio.conteudo_alterado": "mudou o conteúdo do sorteio",
  "sorteio.excluido": "excluiu o sorteio",
  "sorteio.ganhador_definido": "declarou o ganhador de",
  "sorteio.ganhador_removido": "removeu o ganhador de",
  "config.pagamento_alterada": "alterou as credenciais de pagamento",
  "config.site_alterada": "alterou as configurações do site",
  "config.mensagens_alterada": "alterou as mensagens automáticas",
  "skin.alterada": "alterou o catálogo de skins",
  "reserva.criada": "reservou números",
  "pix.gerado": "gerou o Pix",
  "pagamento.aprovado": "confirmou o pagamento",
  "pagamento.recusado": "recusou o pagamento",
  "reservas.expiradas": "expirou reservas pendentes",
} as const;

export type AcaoDeLog = keyof typeof ACOES;

/// Entidades que um registro pode apontar. Fechada, não string livre: a tela
/// precisa saber para onde linkar o alvo.
export type TipoDeAlvo =
  | "User"
  | "Raffle"
  | "Reservation"
  | "Payment"
  | "SkinTemplate"
  | "Tenant";

/**
 * Texto da ação para a tela.
 *
 * Aceita string qualquer, não só AcaoDeLog: o que vem do banco é `acao
 * String`, e registro antigo de ação renomeada precisa continuar aparecendo.
 */
export function textoDaAcao(acao: string): string {
  return (ACOES as Record<string, string>)[acao] ?? acao;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/activity-log-actions.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity-log-actions.ts src/lib/activity-log-actions.test.ts
git commit -m "feat: catalogo tipado das acoes registraveis"
```

---

### Task 3: Montagem do campo `detalhes`

**Files:**
- Create: `src/lib/activity-log-detalhes.ts`
- Test: `src/lib/activity-log-detalhes.test.ts`

**Interfaces:**
- Consumes: `formatCpf` de `@/lib/cpf`.
- Produces: `diferencas(antes, depois): { antes: Record<string, unknown>; depois: Record<string, unknown> }`, `sanitizarDetalhes(valor: unknown): unknown`, `mascararCpf(valor: string): string`, `OMITIDO: string`.

As duas metades vivem no mesmo arquivo porque respondem à mesma pergunta: o que entra em `detalhes`. Uma decide o que mudou, a outra decide o que pode ser gravado.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/lib/activity-log-detalhes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  OMITIDO,
  diferencas,
  mascararCpf,
  sanitizarDetalhes,
} from "./activity-log-detalhes";

describe("diferencas", () => {
  it("guarda só o que mudou, não o registro inteiro", () => {
    const d = diferencas(
      { nome: "Maria", papel: "PARTICIPANT", email: "m@x.com" },
      { nome: "Maria", papel: "ADMIN", email: "m@x.com" }
    );
    expect(d).toEqual({ antes: { papel: "PARTICIPANT" }, depois: { papel: "ADMIN" } });
  });

  it("nada mudou devolve os dois lados vazios", () => {
    const d = diferencas({ a: 1 }, { a: 1 });
    expect(d).toEqual({ antes: {}, depois: {} });
  });

  it("trata null e string vazia como valores diferentes de verdade", () => {
    // O formulário manda "" onde o banco tem null. Se isso contasse como
    // mudança, salvar sem mexer em nada geraria registro toda vez.
    const d = diferencas({ email: null }, { email: null });
    expect(d.depois).toEqual({});
  });
});

describe("mascararCpf", () => {
  it("mostra só o fim, o bastante para conferir que é a mesma pessoa", () => {
    expect(mascararCpf("11144477735")).toBe("***.***.777-35");
  });

  it("entrada fora do formato não vaza o que veio", () => {
    expect(mascararCpf("123")).toBe("***");
  });
});

describe("sanitizarDetalhes", () => {
  it("some com campo de segredo em qualquer nível", () => {
    const limpo = sanitizarDetalhes({
      antes: { passwordHash: "$2a$10$abc" },
      depois: { clientSecret: "sk_live_123", provider: "SYNCPAY" },
    }) as Record<string, Record<string, unknown>>;

    expect(limpo.antes.passwordHash).toBe(OMITIDO);
    expect(limpo.depois.clientSecret).toBe(OMITIDO);
    expect(limpo.depois.provider).toBe("SYNCPAY");
  });

  it("mascara CPF dos dois lados da mudança", () => {
    const limpo = sanitizarDetalhes({
      antes: { cpf: "11144477735" },
      depois: { cpf: "52998224725" },
    }) as Record<string, Record<string, unknown>>;

    expect(limpo.antes.cpf).toBe("***.***.777-35");
    expect(limpo.depois.cpf).toBe("***.***.472-5");
  });

  it("preserva lista e valores simples", () => {
    expect(sanitizarDetalhes({ numeros: [1, 2, 3], o_que: "capa" })).toEqual({
      numeros: [1, 2, 3],
      o_que: "capa",
    });
  });

  it("não entra em recursão infinita com objeto que aponta para si mesmo", () => {
    const raso: Record<string, unknown> = { a: 1 };
    raso.eu = raso;
    expect(() => sanitizarDetalhes(raso)).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/activity-log-detalhes.test.ts`
Expected: FAIL, `Failed to resolve import "./activity-log-detalhes"`.

- [ ] **Step 3: Implementar**

Crie `src/lib/activity-log-detalhes.ts`:

```ts
// Montagem do campo `detalhes` do registro de atividade.
//
// Duas responsabilidades que respondem à mesma pergunta, "o que pode ser
// gravado": diferencas decide o que mudou, sanitizarDetalhes decide o que
// tem permissão de virar linha no banco.
//
// A sanitização é aplicada dentro de registrarLog, não na hora de chamar, de
// propósito. Depender de quem chama lembrar de limpar é o mesmo que não ter
// regra: basta uma action nova esquecer e a credencial do gateway está no
// log, que é justamente o lugar de onde ninguém apaga.

import { formatCpf } from "@/lib/cpf";

export const OMITIDO = "[omitido]";

/** Profundidade máxima da varredura, contra ciclo e objeto gigante. */
const PROFUNDIDADE_MAXIMA = 5;

/**
 * Campos que nunca são gravados, nem no lado "antes".
 *
 * Casa por pedaço do nome, não por igualdade, porque o mesmo segredo aparece
 * com nomes diferentes por aí: clientSecret, webhookToken, passwordHash.
 */
const SEGREDOS = [
  "senha",
  "password",
  "secret",
  "token",
  "hash",
  "apikey",
  "credential",
  "authorization",
];

const CAMPOS_DE_CPF = ["cpf"];

function ehSegredo(chave: string): boolean {
  const k = chave.toLowerCase();
  return SEGREDOS.some((s) => k.includes(s));
}

function ehCpf(chave: string): boolean {
  const k = chave.toLowerCase();
  return CAMPOS_DE_CPF.some((s) => k.includes(s));
}

/**
 * Mostra só o fim do CPF.
 *
 * O painel já exibe CPF completo nas telas de cliente. O log não precisa
 * virar uma segunda cópia da base de PII, com retenção própria e leitura mais
 * ampla; o suficiente aqui é conferir que é a mesma pessoa.
 */
export function mascararCpf(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length !== 11) return "***";
  return `***.***.${formatCpf(digitos).slice(8)}`;
}

/**
 * O que mudou entre dois retratos do mesmo registro.
 *
 * Devolve os dois lados só das chaves que diferem. Gravar o registro inteiro
 * encheria o banco de campos que ninguém mexeu e esconderia a mudança real no
 * meio deles.
 */
export function diferencas(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>
): { antes: Record<string, unknown>; depois: Record<string, unknown> } {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};

  for (const chave of Object.keys(depois)) {
    if (Object.is(antes[chave], depois[chave])) continue;
    a[chave] = antes[chave];
    d[chave] = depois[chave];
  }

  return { antes: a, depois: d };
}

/** Remove segredo e mascara CPF, em qualquer profundidade. */
export function sanitizarDetalhes(
  valor: unknown,
  profundidade = 0,
  vistos: WeakSet<object> = new WeakSet()
): unknown {
  if (profundidade > PROFUNDIDADE_MAXIMA) return OMITIDO;
  if (valor === null || typeof valor !== "object") return valor;
  if (vistos.has(valor as object)) return OMITIDO;
  vistos.add(valor as object);

  if (Array.isArray(valor)) {
    return valor.map((item) => sanitizarDetalhes(item, profundidade + 1, vistos));
  }

  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    if (ehSegredo(chave)) {
      saida[chave] = OMITIDO;
      continue;
    }
    if (ehCpf(chave) && typeof item === "string") {
      saida[chave] = mascararCpf(item);
      continue;
    }
    saida[chave] = sanitizarDetalhes(item, profundidade + 1, vistos);
  }
  return saida;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/activity-log-detalhes.test.ts`
Expected: PASS.

Se o teste do CPF `52998224725` falhar, confira o que `formatCpf("52998224725").slice(8)` devolve na implementação de `src/lib/cpf.ts` e ajuste a expectativa do teste para o valor real: o contrato é "só o fim aparece", não um recorte específico.

- [ ] **Step 5: Rodar a guarda de travessão**

Run: `npx vitest run src/lib/sem-travessao.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/activity-log-detalhes.ts src/lib/activity-log-detalhes.test.ts
git commit -m "feat: montagem de detalhes do log, sem segredo e com CPF mascarado"
```

---

### Task 4: O serviço de escrita

**Files:**
- Create: `src/server/services/activity-log.ts`
- Test: `src/server/services/activity-log.test.ts`

**Interfaces:**
- Consumes: `AcaoDeLog` e `TipoDeAlvo` da Task 2; `sanitizarDetalhes` da Task 3; `ipDaRequisicao` de `@/server/services/login-throttle`; `auth` de `@/auth`; `prisma` de `@/lib/db`.
- Produces: `registrarLog(entrada: EntradaDeLog): Promise<void>` e a interface `EntradaDeLog` com os campos `acao`, `tenantId?`, `alvo?`, `detalhes?`, `origem?`, `ator?`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/server/services/activity-log.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const criar = vi.fn();
const sessao = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { activityLog: { create: (args: unknown) => criar(args) } },
}));
vi.mock("@/auth", () => ({ auth: () => sessao() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }),
}));

const { registrarLog } = await import("./activity-log");

describe("registrarLog", () => {
  beforeEach(() => {
    criar.mockReset().mockResolvedValue({ id: "log1" });
    sessao.mockReset().mockResolvedValue({
      user: {
        id: "u1",
        name: "João",
        email: "joao@x.com",
        role: "ADMIN",
      },
    });
  });

  it("congela o ator da sessão no registro", async () => {
    await registrarLog({ acao: "usuario.criado", tenantId: "t1" });

    const dados = criar.mock.calls[0]![0].data;
    expect(dados.actorId).toBe("u1");
    expect(dados.actorName).toBe("João");
    expect(dados.actorRole).toBe("ADMIN");
    expect(dados.tenantId).toBe("t1");
    expect(dados.origem).toBe("PAINEL");
    expect(dados.ip).toBe("203.0.113.9");
  });

  it("com ator informado não consulta a sessão", async () => {
    // É o caso do webhook e do cron: não existe sessão nenhuma para ler, e
    // tentar ler daria erro dentro do caminho de confirmação de pagamento.
    await registrarLog({
      acao: "pagamento.aprovado",
      origem: "SISTEMA",
      ator: { nome: "Gateway SyncPay" },
    });

    expect(sessao).not.toHaveBeenCalled();
    const dados = criar.mock.calls[0]![0].data;
    expect(dados.actorName).toBe("Gateway SyncPay");
    expect(dados.actorId).toBeNull();
    expect(dados.origem).toBe("SISTEMA");
  });

  it("sanitiza antes de gravar, sem depender de quem chamou", async () => {
    await registrarLog({
      acao: "config.pagamento_alterada",
      detalhes: { depois: { clientSecret: "sk_live_1" } },
    });

    const dados = criar.mock.calls[0]![0].data;
    expect(JSON.stringify(dados.detalhes)).not.toContain("sk_live_1");
  });

  it("não lança quando a escrita falha, e reporta", async () => {
    // Um registro que falha não pode derrubar a venda que ele registrava.
    criar.mockRejectedValue(new Error("banco fora"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      registrarLog({ acao: "reserva.criada" })
    ).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();

    erro.mockRestore();
  });

  it("sem sessão grava ator desconhecido em vez de sumir com o registro", async () => {
    sessao.mockResolvedValue(null);
    await registrarLog({ acao: "reserva.criada" });

    expect(criar.mock.calls[0]![0].data.actorName).toBe("Desconhecido");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/server/services/activity-log.test.ts`
Expected: FAIL, `Failed to resolve import "./activity-log"`.

- [ ] **Step 3: Implementar o serviço**

Crie `src/server/services/activity-log.ts`:

```ts
// Escrita do registro de atividade.
//
// Uma função só, chamada explicitamente de cada ponto que importa. A
// alternativa automática (extension do Prisma logando todo write) foi
// descartada no design: naquele nível não existe sessão, então o registro não
// saberia QUEM fez, e ele registraria operações de banco em vez de intenções,
// então publicar um sorteio de mil números viraria mil linhas iguais.
//
// A regra que sustenta tudo: esta função NUNCA lança. Ela é chamada de dentro
// de confirmação de pagamento, de criação de reserva e de promoção de conta.
// Derrubar qualquer um deles porque o log falhou trocaria um problema pequeno
// por um grande.

import { headers } from "next/headers";
import type { Prisma, Role } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { sanitizarDetalhes } from "@/lib/activity-log-detalhes";
import { ipDaRequisicao } from "@/server/services/login-throttle";
import type { AcaoDeLog, TipoDeAlvo } from "@/lib/activity-log-actions";

type Origem = "PAINEL" | "SISTEMA" | "PUBLICO";

export interface EntradaDeLog {
  acao: AcaoDeLog;
  tenantId?: string | null;
  alvo?: { tipo: TipoDeAlvo; id: string; rotulo?: string | null };
  detalhes?: Record<string, unknown>;
  /**
   * Onde a ação nasceu. Padrão PAINEL. Independe de quem agiu: a troca do
   * link da Steam tem ator de sessão e origem PUBLICO ao mesmo tempo.
   */
  origem?: Origem;
  /**
   * Só quando NÃO há sessão para ler: webhook de gateway e cron. Com ator
   * informado, a sessão nem é consultada, o que também evita uma ida ao banco
   * dentro do caminho de confirmação de pagamento.
   */
  ator?: { nome: string };
}

interface AtorResolvido {
  id: string | null;
  nome: string;
  papel: Role | null;
  email: string | null;
}

async function atorDaSessao(): Promise<AtorResolvido> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) {
    return { id: null, nome: "Desconhecido", papel: null, email: null };
  }
  return {
    id: u.id,
    nome: u.name ?? "Sem nome",
    papel: (u.role as Role | undefined) ?? null,
    email: u.email ?? null,
  };
}

/**
 * IP de quem chamou, quando dá para saber.
 *
 * `headers()` só existe dentro do escopo de uma requisição; no cron e em
 * script ele lança. O catch devolve nulo em vez de deixar o erro subir: o
 * registro entra sem IP, que é bem melhor do que não entrar.
 */
async function ipAtual(): Promise<string | null> {
  try {
    return ipDaRequisicao(await headers());
  } catch {
    return null;
  }
}

export async function registrarLog(entrada: EntradaDeLog): Promise<void> {
  try {
    const ator: AtorResolvido = entrada.ator
      ? { id: null, nome: entrada.ator.nome, papel: null, email: null }
      : await atorDaSessao();

    await prisma.activityLog.create({
      data: {
        tenantId: entrada.tenantId ?? null,
        origem: entrada.origem ?? "PAINEL",
        actorId: ator.id,
        actorName: ator.nome,
        actorRole: ator.papel,
        actorEmail: ator.email,
        acao: entrada.acao,
        alvoTipo: entrada.alvo?.tipo ?? null,
        alvoId: entrada.alvo?.id ?? null,
        alvoRotulo: entrada.alvo?.rotulo ?? null,
        detalhes: entrada.detalhes
          ? (sanitizarDetalhes(entrada.detalhes) as Prisma.InputJsonValue)
          : undefined,
        ip: await ipAtual(),
      },
    });
  } catch (err) {
    console.error("[activity-log] falha ao registrar", entrada.acao, err);
  }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/server/services/activity-log.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Typecheck e guarda de travessão**

Run: `npm run typecheck && npx vitest run src/lib/sem-travessao.test.ts`
Expected: ambos limpos.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/activity-log.ts src/server/services/activity-log.test.ts
git commit -m "feat: servico de escrita do log, que nunca derruba quem o chamou"
```

---

### Task 5: Consulta e limpeza

**Files:**
- Create: `src/server/services/activity-log-query.ts`
- Test: `src/server/services/activity-log-query.test.ts`

**Interfaces:**
- Consumes: `prisma`, `TipoDeAlvo` da Task 2.
- Produces: `montarWhere(filtro: FiltroDeLogs): Prisma.ActivityLogWhereInput`, `listarLogs(filtro: FiltroDeLogs): Promise<{ registros: ActivityLog[]; proximo: Cursor | null }>`, `limparLogsAntigos(agora?: Date): Promise<{ apagados: number }>`, `type Cursor = { criadoEm: Date; id: string }`, `RETENCAO_DIAS`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/server/services/activity-log-query.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    activityLog: {
      findMany: (a: unknown) => findMany(a),
      findFirst: (a: unknown) => findFirst(a),
      deleteMany: (a: unknown) => deleteMany(a),
    },
  },
}));

const { montarWhere, listarLogs, limparLogsAntigos, RETENCAO_DIAS } =
  await import("./activity-log-query");

describe("montarWhere", () => {
  it("prende ao tenant quando ele vem preenchido", () => {
    expect(montarWhere({ tenantId: "t1" })).toEqual({ tenantId: "t1" });
  });

  it("tenant nulo não filtra, que é o SUPER_ADMIN vendo todos", () => {
    expect(montarWhere({ tenantId: null })).toEqual({});
  });

  it("cursor compara data e desempata por id, senão pula registro do mesmo instante", () => {
    const quando = new Date("2026-08-26T12:00:00Z");
    const where = montarWhere({
      tenantId: "t1",
      cursor: { criadoEm: quando, id: "log9" },
    });

    expect(where.OR).toEqual([
      { criadoEm: { lt: quando } },
      { criadoEm: quando, id: { lt: "log9" } },
    ]);
  });

  it("filtra por alvo, que é o atalho 'ver histórico'", () => {
    const where = montarWhere({
      tenantId: "t1",
      alvo: { tipo: "Raffle", id: "r1" },
    });
    expect(where.alvoTipo).toBe("Raffle");
    expect(where.alvoId).toBe("r1");
  });
});

describe("listarLogs", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("devolve cursor quando há mais página", async () => {
    const linhas = Array.from({ length: 3 }, (_, i) => ({
      id: `log${i}`,
      criadoEm: new Date(2026, 7, 26, 12, 0, i),
    }));
    findMany.mockResolvedValue(linhas);

    const r = await listarLogs({ tenantId: "t1", limite: 2 });

    expect(r.registros).toHaveLength(2);
    expect(r.proximo).toEqual({
      criadoEm: linhas[1]!.criadoEm,
      id: "log1",
    });
  });

  it("última página não devolve cursor", async () => {
    findMany.mockResolvedValue([{ id: "log0", criadoEm: new Date() }]);
    const r = await listarLogs({ tenantId: "t1", limite: 2 });
    expect(r.proximo).toBeNull();
  });
});

describe("limparLogsAntigos", () => {
  beforeEach(() => {
    findFirst.mockReset();
    findMany.mockReset();
    deleteMany.mockReset();
  });

  it("não apaga nada quando o mais antigo ainda está dentro da retenção", async () => {
    findFirst.mockResolvedValue({ criadoEm: new Date("2026-08-01") });

    const r = await limparLogsAntigos(new Date("2026-08-26"));

    expect(r.apagados).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("tabela vazia não tenta apagar", async () => {
    findFirst.mockResolvedValue(null);
    const r = await limparLogsAntigos(new Date("2026-08-26"));
    expect(r.apagados).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("apaga em lotes o que passou da retenção", async () => {
    findFirst.mockResolvedValue({ criadoEm: new Date("2020-01-01") });
    findMany
      .mockResolvedValueOnce([{ id: "a" }, { id: "b" }])
      .mockResolvedValueOnce([]);
    deleteMany.mockResolvedValue({ count: 2 });

    const r = await limparLogsAntigos(new Date("2026-08-26"));

    expect(r.apagados).toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
    });
  });

  it("a retenção é de um ano", () => {
    expect(RETENCAO_DIAS).toBe(365);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/server/services/activity-log-query.test.ts`
Expected: FAIL, `Failed to resolve import "./activity-log-query"`.

- [ ] **Step 3: Implementar**

Crie `src/server/services/activity-log-query.ts`:

```ts
// Leitura e manutenção do registro de atividade.
//
// Separado do serviço de escrita de propósito: registrarLog é importado por
// quase toda server action do projeto, e não deve arrastar junto o código de
// paginação e limpeza que só a tela e o cron usam.

import type { ActivityLog, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { TipoDeAlvo } from "@/lib/activity-log-actions";

export type Cursor = { criadoEm: Date; id: string };

export interface FiltroDeLogs {
  /**
   * Painel a filtrar. NULO SIGNIFICA TODOS, e é reservado ao SUPER_ADMIN.
   * Quem chama tem que resolver isso a partir da sessão, nunca de parâmetro
   * vindo do cliente.
   */
  tenantId: string | null;
  acao?: string;
  actorId?: string;
  alvo?: { tipo: TipoDeAlvo; id: string };
  de?: Date;
  ate?: Date;
  cursor?: Cursor;
  limite?: number;
}

const LIMITE_PADRAO = 50;

export const RETENCAO_DIAS = 365;

/** Tamanho do lote da limpeza, para não segurar a rota de cron. */
const LOTE_DE_LIMPEZA = 1000;

/** Teto de lotes por execução, contra laço infinito se algo der errado. */
const LOTES_POR_EXECUCAO = 20;

export function montarWhere(filtro: FiltroDeLogs): Prisma.ActivityLogWhereInput {
  const where: Prisma.ActivityLogWhereInput = {};

  if (filtro.tenantId) where.tenantId = filtro.tenantId;
  if (filtro.acao) where.acao = filtro.acao;
  if (filtro.actorId) where.actorId = filtro.actorId;
  if (filtro.alvo) {
    where.alvoTipo = filtro.alvo.tipo;
    where.alvoId = filtro.alvo.id;
  }
  if (filtro.de || filtro.ate) {
    where.criadoEm = {
      ...(filtro.de ? { gte: filtro.de } : {}),
      ...(filtro.ate ? { lte: filtro.ate } : {}),
    };
  }

  // Cursor comparando data E id. Só a data pularia registros: várias linhas
  // podem cair no mesmo milissegundo, e o `lt` deixaria as irmãs para trás.
  if (filtro.cursor) {
    where.OR = [
      { criadoEm: { lt: filtro.cursor.criadoEm } },
      { criadoEm: filtro.cursor.criadoEm, id: { lt: filtro.cursor.id } },
    ];
  }

  return where;
}

/**
 * Página de registros, do mais novo para o mais velho.
 *
 * Paginação por cursor, e não por deslocamento: a tabela recebe linhas novas
 * no topo o tempo todo, então `skip` faria a página 2 repetir o que a 1 já
 * tinha mostrado.
 */
export async function listarLogs(
  filtro: FiltroDeLogs
): Promise<{ registros: ActivityLog[]; proximo: Cursor | null }> {
  const limite = filtro.limite ?? LIMITE_PADRAO;

  // Pede um a mais só para saber se existe página seguinte, sem um count.
  const linhas = await prisma.activityLog.findMany({
    where: montarWhere(filtro),
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    take: limite + 1,
  });

  const temMais = linhas.length > limite;
  const registros = temMais ? linhas.slice(0, limite) : linhas;
  const ultimo = registros[registros.length - 1];

  return {
    registros,
    proximo: temMais && ultimo ? { criadoEm: ultimo.criadoEm, id: ultimo.id } : null,
  };
}

/**
 * Apaga o que passou da retenção.
 *
 * A consulta ao registro mais antigo vem antes de qualquer deleção: na
 * imensa maioria das execuções não há nada para apagar, e sair por aqui custa
 * uma leitura de índice em vez de um DELETE varrendo a tabela a cada cinco
 * minutos.
 */
export async function limparLogsAntigos(
  agora: Date = new Date()
): Promise<{ apagados: number }> {
  const corte = new Date(agora.getTime() - RETENCAO_DIAS * 24 * 60 * 60 * 1000);

  const maisAntigo = await prisma.activityLog.findFirst({
    orderBy: { criadoEm: "asc" },
    select: { criadoEm: true },
  });
  if (!maisAntigo || maisAntigo.criadoEm >= corte) return { apagados: 0 };

  let apagados = 0;
  for (let lote = 0; lote < LOTES_POR_EXECUCAO; lote++) {
    const alvos = await prisma.activityLog.findMany({
      where: { criadoEm: { lt: corte } },
      select: { id: true },
      take: LOTE_DE_LIMPEZA,
    });
    if (alvos.length === 0) break;

    const r = await prisma.activityLog.deleteMany({
      where: { id: { in: alvos.map((a) => a.id) } },
    });
    apagados += r.count;

    if (alvos.length < LOTE_DE_LIMPEZA) break;
  }

  return { apagados };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/server/services/activity-log-query.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/activity-log-query.ts src/server/services/activity-log-query.test.ts
git commit -m "feat: consulta paginada por cursor e limpeza por retencao dos logs"
```

---

### Task 6: Instrumentar as contas

**Files:**
- Modify: `src/server/actions/users.ts`
- Test: `src/server/actions/users.integration.test.ts` (criar)

**Interfaces:**
- Consumes: `registrarLog` da Task 4, `diferencas` da Task 3.
- Produces: registros com as ações `usuario.criado`, `usuario.editado`, `usuario.papel_alterado`, `usuario.senha_gerada`.

Esta é a task de maior valor do plano: é a área que decide quem opera o painel.

- [ ] **Step 1: Escrever o teste de integração que falha**

Crie `src/server/actions/users.integration.test.ts`:

```ts
// Integração das server actions de usuário com o registro de atividade.
//
// Pulado quando DATABASE_URL não aponta para um Postgres local: as actions
// escrevem de verdade, e apontar para produção encheria o banco real de lixo.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

function bancoLocal(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

const suite = bancoLocal() ? describe : describe.skip;

suite("log das actions de usuário (integração)", () => {
  let tenantId: string;
  let adminId: string;
  let alvoId: string;

  beforeAll(async () => {
    const dono = await prisma.user.create({
      data: { name: "Dono Teste", email: `dono-${Date.now()}@x.com`, role: "ADMIN" },
    });
    const tenant = await prisma.tenant.create({
      data: { name: "Tenant Log", slug: `log-${Date.now()}`, ownerId: dono.id },
    });
    tenantId = tenant.id;
    adminId = dono.id;
    await prisma.user.update({
      where: { id: dono.id },
      data: { tenantId },
    });
    const alvo = await prisma.user.create({
      data: { name: "Cliente Teste", role: "PARTICIPANT", tenantId },
    });
    alvoId = alvo.id;

    vi.mock("@/lib/auth-helpers", async (original) => {
      const real = (await original()) as Record<string, unknown>;
      return {
        ...real,
        getAdminOrThrow: async () => ({
          user: { id: adminId, name: "Dono Teste", role: "ADMIN", tenantId },
        }),
      };
    });
  });

  afterAll(async () => {
    await prisma.activityLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  it("promover grava papel_alterado com o antes e o depois", async () => {
    const { updateUserAction } = await import("./users");

    await updateUserAction({
      id: alvoId,
      name: "Cliente Teste",
      email: "",
      cpf: "",
      phone: "",
      role: "ADMIN",
      showModBadge: false,
    });

    const log = await prisma.activityLog.findFirst({
      where: { alvoId, acao: "usuario.papel_alterado" },
      orderBy: { criadoEm: "desc" },
    });

    expect(log).not.toBeNull();
    const detalhes = log!.detalhes as {
      antes: Record<string, unknown>;
      depois: Record<string, unknown>;
    };
    expect(detalhes.antes.papel).toBe("PARTICIPANT");
    expect(detalhes.depois.papel).toBe("ADMIN");
  });

  it("a senha temporária nunca aparece no registro", async () => {
    const { gerarSenhaDePainelAction } = await import("./users");

    const r = await gerarSenhaDePainelAction(alvoId);
    const log = await prisma.activityLog.findFirst({
      where: { alvoId, acao: "usuario.senha_gerada" },
      orderBy: { criadoEm: "desc" },
    });

    expect(log).not.toBeNull();
    if (r.ok) {
      expect(JSON.stringify(log!.detalhes)).not.toContain(r.data.senhaTemporaria);
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que pula ou falha**

Run: `npx vitest run src/server/actions/users.integration.test.ts`
Expected: nesta máquina, `2 skipped`. Com Postgres local, FAIL, porque nenhum log é gravado ainda.

- [ ] **Step 3: Ampliar o `select` do alvo em `updateUserAction`**

Em `src/server/actions/users.ts`, o `prisma.user.findUnique` que carrega `target` precisa trazer os campos que entram no antes. Troque o bloco `select` por:

```ts
      select: {
        id: true,
        name: true,
        email: true,
        cpf: true,
        phone: true,
        role: true,
        showModBadge: true,
        tenantId: true,
        reservations: {
          where: { raffle: { tenantId } },
          select: { id: true },
          take: 1,
        },
      },
```

- [ ] **Step 4: Registrar em `updateUserAction`**

Adicione os imports no topo do arquivo:

```ts
import { registrarLog } from "@/server/services/activity-log";
import { diferencas } from "@/lib/activity-log-detalhes";
```

Logo depois do `prisma.user.update` bem-sucedido e antes dos `revalidatePath`:

```ts
    // Papel alterado ganha ação própria mesmo quando outros campos mudaram
    // junto. É o que alguém procura, e escondê-lo dentro de "editou os dados"
    // apagaria a promoção no meio do barulho.
    const mudou = diferencas(
      {
        nome: target.name,
        email: target.email,
        cpf: target.cpf,
        telefone: target.phone,
        papel: target.role,
        seloDeMod: target.showModBadge,
      },
      {
        nome: name,
        email: email || null,
        cpf: cpf || null,
        telefone: phone || null,
        papel: finalRole,
        seloDeMod: showModBadge,
      }
    );
    // Salvar sem mexer em nada não vira linha: o histórico é do que mudou.
    if (Object.keys(mudou.depois).length > 0) {
      await registrarLog({
        acao:
          mudou.depois.papel !== undefined
            ? "usuario.papel_alterado"
            : "usuario.editado",
        tenantId,
        alvo: { tipo: "User", id, rotulo: name },
        detalhes: mudou,
      });
    }
```

- [ ] **Step 5: Registrar em `criarUsuarioAction`**

Depois do `prisma.user.create`, antes dos `revalidatePath`:

```ts
      await registrarLog({
        acao: "usuario.criado",
        tenantId,
        alvo: { tipo: "User", id: criado.id, rotulo: name },
        // A senha em si nunca entra: ela aparece uma vez na tela de quem
        // criou e o banco guarda só o hash. Registrar que a conta nasceu com
        // acesso ao painel é o que interessa aqui.
        detalhes: { papel: role, comAcessoAoPainel: Boolean(senhaTemporaria) },
      });
```

- [ ] **Step 6: Registrar em `gerarSenhaDePainelAction`**

Depois do `prisma.user.update` que grava o hash, antes do `revalidatePath`:

```ts
    await registrarLog({
      acao: "usuario.senha_gerada",
      tenantId,
      alvo: { tipo: "User", id: userId, rotulo: alvo.email },
      detalhes: { papel: alvo.role },
    });
```

O `tenantId` já existe nesse escopo desde o commit que prendeu a action ao painel.

- [ ] **Step 7: Typecheck e testes**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck limpo, suíte verde (a de integração pula).

- [ ] **Step 8: Commit**

```bash
git add src/server/actions/users.ts src/server/actions/users.integration.test.ts
git commit -m "feat: registra criacao, edicao, promocao e reset de senha de conta"
```

---

### Task 7: Instrumentar a entrada no painel

**Files:**
- Modify: `src/auth.ts`

**Interfaces:**
- Consumes: `registrarLog` da Task 4.
- Produces: registros `painel.login` e `painel.login_recusado`.

- [ ] **Step 1: Importar o serviço**

Em `src/auth.ts`, junto dos outros imports:

```ts
import { registrarLog } from "@/server/services/activity-log";
```

- [ ] **Step 2: Registrar a recusa no provider `admin-password`**

No bloco que já existe:

```ts
        if (!user || !user.passwordHash || !senhaConfere) {
          await registrarFalha(chaves);
```

acrescente, logo depois do `registrarFalha(chaves)` e antes do `return null`:

```ts
          // Ator informado à mão: não existe sessão numa entrada recusada, e
          // o e-mail digitado é tudo o que se sabe de quem tentou.
          await registrarLog({
            acao: "painel.login_recusado",
            tenantId: user?.tenantId ?? null,
            origem: "PAINEL",
            ator: { nome: parsed.data.email.toLowerCase() },
            detalhes: { motivo: user ? "senha incorreta" : "conta inexistente" },
          });
```

Repita o mesmo bloco dentro do `if (!PAPEIS_DE_PAINEL.has(user.role))` seguinte, trocando o motivo por `"papel sem acesso ao painel"`.

- [ ] **Step 3: Registrar a entrada aceita**

Logo antes do `return { id: user.id, ... }` do provider `admin-password`:

```ts
        await registrarLog({
          acao: "painel.login",
          tenantId: user.tenantId,
          origem: "PAINEL",
          ator: { nome: user.name },
          detalhes: { papel: user.role },
        });
```

O ator vai informado, não lido da sessão: dentro do `authorize` a sessão ainda não existe, é ele quem está criando.

- [ ] **Step 4: Verificar à mão que a entrada é registrada**

Run: `npm run dev` e entre no painel por `http://localhost:3000/login` com uma conta de admin.

Depois, com o Prisma Studio (`npx prisma studio`), confira que existe uma linha em `ActivityLog` com `acao = "painel.login"` e `actorName` igual ao nome da conta.

Se o `.env` desta máquina ainda apontar para produção, **não faça este passo**: aponte `DATABASE_URL` para um Postgres local antes.

- [ ] **Step 5: Typecheck e testes**

Run: `npm run typecheck && npx vitest run`
Expected: limpos.

- [ ] **Step 6: Commit**

```bash
git add src/auth.ts
git commit -m "feat: registra entrada no painel e tentativa recusada"
```

---

### Task 8: Instrumentar os sorteios

**Files:**
- Modify: `src/server/actions/raffles.ts`
- Modify: `src/server/actions/raffle-duplicate.ts`
- Modify: `src/server/actions/raffle-content.ts`

**Interfaces:**
- Consumes: `registrarLog` da Task 4.
- Produces: `sorteio.criado`, `sorteio.editado`, `sorteio.status_alterado`, `sorteio.excluido`, `sorteio.duplicado`, `sorteio.conteudo_alterado`, `sorteio.ganhador_definido`, `sorteio.ganhador_removido`.

- [ ] **Step 1: `raffles.ts`, as quatro ações do ciclo**

Importe `registrarLog` e acrescente, cada uma depois da escrita correspondente e antes dos `revalidatePath`:

Em `createRaffleAction`, depois do create:

```ts
    await registrarLog({
      acao: "sorteio.criado",
      tenantId,
      alvo: { tipo: "Raffle", id: criado.id, rotulo: criado.title },
      detalhes: { slug: criado.slug },
    });
```

Em `updateRaffleAction`, depois do update:

```ts
    await registrarLog({
      acao: "sorteio.editado",
      tenantId,
      alvo: { tipo: "Raffle", id: parsed.data.id, rotulo: parsed.data.title },
    });
```

Em `updateRaffleStatusAction`, depois da checagem `result.count === 0`:

```ts
    await registrarLog({
      acao: "sorteio.status_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: parsed.data.id },
      detalhes: { depois: { status: parsed.data.status } },
    });
```

Em `deleteRaffleAction`, depois do delete:

```ts
    // O rótulo é congelado aqui porque o sorteio deixou de existir: sem ele o
    // registro viraria "excluiu o sorteio <cuid>", que não diz nada a
    // ninguém depois de uma semana.
    await registrarLog({
      acao: "sorteio.excluido",
      tenantId,
      alvo: { tipo: "Raffle", id: parsed.data.id, rotulo: parsed.data.confirmTitle },
    });
```

Se o nome da variável do registro criado ou atualizado for diferente nessas actions, use o que existe no arquivo; o que importa é o id e o título.

- [ ] **Step 2: `raffle-duplicate.ts`**

Em `duplicarSorteioAction`, depois da criação da cópia:

```ts
    await registrarLog({
      acao: "sorteio.duplicado",
      tenantId,
      alvo: { tipo: "Raffle", id: novo.id, rotulo: novo.title },
      detalhes: { origem: { id: original.id, titulo: original.title } },
    });
```

- [ ] **Step 3: `raffle-content.ts`, uma chamada por action de conteúdo**

Importe `registrarLog` e acrescente, ao fim do caminho de sucesso de cada uma das actions abaixo, a chamada com o `o_que` correspondente:

| Action | `detalhes.o_que` |
| --- | --- |
| `uploadRaffleImageAction` | `"imagem adicionada"` |
| `addRaffleImageByUrlAction` | `"imagem por URL"` |
| `deleteRaffleImageAction` | `"imagem removida"` |
| `setRaffleCoverAction` | `"capa"` |
| `setRafflePrizesAction` | `"prêmios"` |
| `setRafflePaymentProviderAction` | `"gateway do sorteio"` |
| `setRafflePromotionsAction` | `"promoções"` |
| `setRaffleAwardedTicketsAction` | `"títulos premiados"` |
| `setRaffleSurpriseBoxCombosAction` | `"combos de caixa surpresa"` |
| `createSurpriseBoxPrizesAction` | `"prêmios de caixa surpresa"` |
| `toggleSurpriseBoxPrizeLockAction` | `"trava de prêmio de caixa"` |
| `deleteSurpriseBoxPrizeAction` | `"prêmio de caixa removido"` |

A chamada, com o `o_que` da linha:

```ts
    await registrarLog({
      acao: "sorteio.conteudo_alterado",
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { o_que: "capa" },
    });
```

Use o nome de variável do id do sorteio que já existe em cada action (`raffleId`, `parsed.data.raffleId` ou equivalente).

- [ ] **Step 4: Ganhador, com ação própria**

Em `setRaffleWinnerAction`, depois da escrita:

```ts
    await registrarLog({
      acao: "sorteio.ganhador_definido",
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId },
      detalhes: { numero: parsed.data.winnerNumber },
    });
```

Em `clearRaffleWinnerAction`, depois da escrita:

```ts
    await registrarLog({
      acao: "sorteio.ganhador_removido",
      tenantId,
      alvo: { tipo: "Raffle", id: raffleId },
    });
```

Ajuste o campo de `detalhes` para o nome real do número vencedor no schema de entrada da action.

- [ ] **Step 5: Typecheck e testes**

Run: `npm run typecheck && npx vitest run`
Expected: limpos. Erro de tipo em `acao` significa chave fora do catálogo da Task 2, que é exatamente a proteção funcionando.

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/raffles.ts src/server/actions/raffle-duplicate.ts src/server/actions/raffle-content.ts
git commit -m "feat: registra o ciclo de vida e o conteudo dos sorteios"
```

---

### Task 9: Instrumentar configurações, catálogo e link da Steam

**Files:**
- Modify: `src/server/actions/payment-settings.ts`
- Modify: `src/server/actions/settings.ts`
- Modify: `src/server/actions/messages-settings.ts`
- Modify: `src/server/actions/skin-templates.ts`
- Modify: `src/server/actions/steam.ts`

**Interfaces:**
- Consumes: `registrarLog` da Task 4.
- Produces: `config.pagamento_alterada`, `config.site_alterada`, `config.mensagens_alterada`, `skin.alterada`, `usuario.trade_url_alterada`.

- [ ] **Step 1: Credenciais de pagamento**

Em `updatePaymentSettingsAction`, depois da escrita:

```ts
    // Só os NOMES dos campos que mudaram. O valor é credencial de gateway, e
    // um log que guarda a credencial que ele deveria proteger transforma a
    // auditoria em outro alvo. A sanitização em registrarLog também barraria,
    // mas não custa nada não mandar.
    await registrarLog({
      acao: "config.pagamento_alterada",
      tenantId,
      alvo: { tipo: "Tenant", id: tenantId },
      detalhes: { camposAlterados: Object.keys(parsed.data) },
    });
```

- [ ] **Step 2: Configurações do site**

Em `updateSiteAction`, `updateThemeAction`, `uploadLogoAction`, `setLogoByUrlAction` e `removeLogoAction`, depois de cada escrita:

```ts
    await registrarLog({
      acao: "config.site_alterada",
      tenantId,
      alvo: { tipo: "Tenant", id: tenantId },
      detalhes: { o_que: "identidade do site" },
    });
```

Troque o `o_que` por `"tema"` em `updateThemeAction` e por `"logo"` nas três de logo.

- [ ] **Step 3: Mensagens automáticas**

Em `updateMessagesSettingsAction`, depois da escrita:

```ts
    await registrarLog({
      acao: "config.mensagens_alterada",
      tenantId,
      alvo: { tipo: "Tenant", id: tenantId },
      detalhes: { camposAlterados: Object.keys(parsed.data) },
    });
```

- [ ] **Step 4: Catálogo de skins**

Em `criarSkinAction`, `atualizarSkinAction` e `removerSkinAction`, depois de cada escrita:

```ts
    await registrarLog({
      acao: "skin.alterada",
      tenantId,
      alvo: { tipo: "SkinTemplate", id: skin.id, rotulo: skin.name },
      detalhes: { o_que: "criada" },
    });
```

Troque o `o_que` por `"editada"` e `"removida"`. Em `removerSkinAction` só existe o id: carregue o nome antes do delete para congelar o rótulo, ou passe `rotulo: null`.

- [ ] **Step 5: Link de troca da Steam**

Em `updateSteamTradeUrlAction`, depois da escrita:

```ts
    // Ação de site público, fora do recorte "painel e dinheiro", incluída de
    // propósito: é o endereço para onde a skin vai. Se ele muda entre o
    // sorteio e a entrega, é a primeira coisa que se quer olhar.
    //
    // Origem PUBLICO com ator de sessão: quem agiu é o próprio participante.
    await registrarLog({
      acao: "usuario.trade_url_alterada",
      origem: "PUBLICO",
      alvo: { tipo: "User", id: session.user.id, rotulo: session.user.name },
    });
```

Sem `tenantId`: a conta do participante é global, não pertence a um painel. Use o nome de variável da sessão que já existe na action.

- [ ] **Step 6: Typecheck e testes**

Run: `npm run typecheck && npx vitest run`
Expected: limpos.

- [ ] **Step 7: Commit**

```bash
git add src/server/actions/payment-settings.ts src/server/actions/settings.ts src/server/actions/messages-settings.ts src/server/actions/skin-templates.ts src/server/actions/steam.ts
git commit -m "feat: registra alteracao de configuracao, catalogo e link da Steam"
```

---

### Task 10: Instrumentar o dinheiro

**Files:**
- Modify: `src/server/actions/reservations.ts`
- Modify: `src/server/services/pix.ts`
- Modify: `src/app/api/webhooks/syncpay/[token]/route.ts`
- Modify: `src/app/api/webhooks/codepay/[token]/route.ts`

**Interfaces:**
- Consumes: `registrarLog` da Task 4.
- Produces: `reserva.criada`, `pix.gerado`, `pagamento.aprovado`, `pagamento.recusado`.

- [ ] **Step 1: Reserva criada**

Em `createReservationAction`, depois da criação bem-sucedida:

```ts
    // void, sem await: isto está no caminho que o cliente espera na tela, e a
    // escrita do log não pode somar latência à compra.
    void registrarLog({
      acao: "reserva.criada",
      tenantId,
      origem: "PUBLICO",
      alvo: { tipo: "Reservation", id: reservation.id },
      detalhes: { quantidade: numbersCount, total: Number(totalAmount) },
    });
```

Use os nomes de variável reais da action para quantidade e total.

- [ ] **Step 2: Pix gerado**

Em `ensurePixForReservation` (`src/server/services/pix.ts`), no caminho de sucesso do `provider.createPixCharge`, depois do `prisma.payment.upsert`:

```ts
    void registrarLog({
      acao: "pix.gerado",
      origem: "PUBLICO",
      alvo: { tipo: "Reservation", id: reservation.id },
      detalhes: { gateway: provider.name, valor: amount },
    });
```

- [ ] **Step 3: Pagamento confirmado pelo polling**

Ainda em `pix.ts`, dentro de `pollPaymentStatusIfPending`, no ramo `resolved === "APPROVED"`, logo depois do `prisma.$transaction`:

```ts
      void registrarLog({
        acao: "pagamento.aprovado",
        origem: "SISTEMA",
        ator: { nome: "Consulta de status no gateway" },
        alvo: { tipo: "Payment", id: paymentId },
        detalhes: { reservaId: reservationId, caminho: "polling" },
      });
```

E no ramo `resolved === "REJECTED"`:

```ts
      void registrarLog({
        acao: "pagamento.recusado",
        origem: "SISTEMA",
        ator: { nome: "Consulta de status no gateway" },
        alvo: { tipo: "Payment", id: paymentId },
        detalhes: { reservaId: reservationId, caminho: "polling" },
      });
```

- [ ] **Step 4: Pagamento confirmado pelo webhook**

Nos dois handlers de webhook, dentro do bloco que efetivamente muda o estado da reserva para paga (o mesmo que já é guardado por idempotência), acrescente:

```ts
    void registrarLog({
      acao: "pagamento.aprovado",
      origem: "SISTEMA",
      ator: { nome: "Webhook SyncPay" },
      alvo: { tipo: "Payment", id: payment.id },
      detalhes: { reservaId: reservation.id, caminho: "webhook" },
    });
```

Troque o nome do ator por `"Webhook CodePay"` no handler da CodePay. Faça o mesmo para o ramo de recusa, com `acao: "pagamento.recusado"`.

**A chamada tem que ficar dentro da guarda de idempotência.** O gateway reenvia o mesmo evento várias vezes, e fora da guarda o mesmo pagamento apareceria repetido na tela, que é justamente o oposto do que o log serve para responder.

- [ ] **Step 5: Typecheck e testes**

Run: `npm run typecheck && npx vitest run`
Expected: limpos.

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/reservations.ts src/server/services/pix.ts src/app/api/webhooks
git commit -m "feat: registra reserva, Pix e confirmacao de pagamento"
```

---

### Task 11: Cron: registro da expiração e limpeza por retenção

**Files:**
- Modify: `src/app/api/cron/expire-reservations/route.ts`

**Interfaces:**
- Consumes: `registrarLog` da Task 4, `limparLogsAntigos` da Task 5, `expireReservations` de `@/server/services/reservations`.
- Produces: registro `reservas.expiradas` e a chamada diária da limpeza.

- [ ] **Step 1: Importar**

```ts
import { registrarLog } from "@/server/services/activity-log";
import { limparLogsAntigos } from "@/server/services/activity-log-query";
```

- [ ] **Step 2: Registrar a expiração e chamar a limpeza**

Troque o corpo do `try` por:

```ts
  try {
    const result = await expireReservations();

    // Uma linha por EXECUÇÃO, não por reserva, e só quando expirou alguma
    // coisa. Uma linha por reserva somaria centenas de registros por dia
    // sobre um evento que ninguém investiga individualmente, e uma linha a
    // cada cinco minutos dizendo "expirei zero" seria pior ainda.
    if (result.expired > 0) {
      await registrarLog({
        acao: "reservas.expiradas",
        origem: "SISTEMA",
        ator: { nome: "Rotina de expiração" },
        detalhes: { quantidade: result.expired },
      });
    }

    // A limpeza sai por uma leitura de índice quando não há nada vencido, que
    // é o caso de quase toda execução. Pendurar aqui evita mais um cron.
    const limpeza = await limparLogsAntigos();

    return NextResponse.json({ ok: true, ...result, logsApagados: limpeza.apagados });
  } catch (err) {
    console.error("[cron expire-reservations]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
```

- [ ] **Step 3: Typecheck e testes**

Run: `npm run typecheck && npx vitest run`
Expected: limpos.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/expire-reservations/route.ts
git commit -m "feat: cron registra expiracao e faz a limpeza por retencao dos logs"
```

---

### Task 12: A tela

**Files:**
- Create: `src/app/(admin)/admin/logs/page.tsx`
- Create: `src/components/admin/logs/lista-de-logs.tsx`
- Modify: `src/components/admin/admin-shell.tsx`
- Modify: `src/app/(admin)/admin/usuarios/[id]/editar/page.tsx`
- Modify: `src/app/(admin)/admin/sorteios/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `listarLogs` e `Cursor` da Task 5; `textoDaAcao`, `ACOES` e `TipoDeAlvo` da Task 2; `requireAdmin` e `getActiveTenantIdForAdmin`.
- Produces: a rota `/admin/logs`, que aceita `?acao=`, `?ator=`, `?alvoTipo=`, `?alvoId=`, `?de=`, `?ate=` e `?cursor=`.

- [ ] **Step 1: Componente da lista**

Crie `src/components/admin/logs/lista-de-logs.tsx`:

```tsx
"use client";

// Lista de registros de atividade.
//
// O detalhe fica fechado por padrão: quem abre a tela está procurando quando
// e quem, e o antes e o depois só interessam depois de achar a linha.

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { textoDaAcao } from "@/lib/activity-log-actions";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface LinhaDeLog {
  id: string;
  criadoEm: Date;
  origem: "PAINEL" | "SISTEMA" | "PUBLICO";
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  acao: string;
  alvoTipo: string | null;
  alvoId: string | null;
  alvoRotulo: string | null;
  detalhes: unknown;
}

const ROTULO_DE_ORIGEM: Record<string, string> = {
  PAINEL: "painel",
  SISTEMA: "sistema",
  PUBLICO: "site",
};

const ROTULO_DE_PAPEL: Record<string, string> = {
  SUPER_ADMIN: "dono",
  ADMIN: "admin",
  AFFILIATE: "afiliado",
  PARTICIPANT: "cliente",
};

/**
 * Para onde o alvo aponta.
 *
 * Devolve nulo para o que não tem tela própria: aí o rótulo fica como texto,
 * em vez de virar um link que leva a 404.
 */
function telaDoAlvo(tipo: string | null, id: string | null): string | null {
  if (!tipo || !id) return null;
  if (tipo === "User") return `/admin/usuarios/${id}/editar`;
  if (tipo === "Raffle") return `/admin/sorteios/${id}/editar`;
  if (tipo === "SkinTemplate") return "/admin/skins";
  return null;
}

export function ListaDeLogs({ registros }: { registros: LinhaDeLog[] }) {
  const [aberto, setAberto] = useState<string | null>(null);

  if (registros.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        Nada registrado com esses filtros.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {registros.map((r) => {
        const temDetalhe = r.detalhes != null;
        const destino = telaDoAlvo(r.alvoTipo, r.alvoId);
        return (
          <div key={r.id} className="px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(r.criadoEm)}
              </span>
              {/* O nome do ator filtra por ele: achar uma linha suspeita e
                  querer ver o resto do que aquela pessoa fez é o movimento
                  seguinte mais comum. */}
              {r.actorId ? (
                <Link
                  href={`/admin/logs?ator=${r.actorId}`}
                  className="font-medium hover:underline"
                >
                  {r.actorName}
                </Link>
              ) : (
                <span className="font-medium">{r.actorName}</span>
              )}
              {r.actorRole && (
                <span className="shrink-0 text-[10px] font-bold uppercase text-muted-foreground">
                  {ROTULO_DE_PAPEL[r.actorRole] ?? r.actorRole}
                </span>
              )}
              <span
                className={cn(
                  "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                  r.origem === "SISTEMA"
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
                    : "border-border bg-muted text-muted-foreground"
                )}
              >
                {ROTULO_DE_ORIGEM[r.origem] ?? r.origem}
              </span>
              <span className="text-muted-foreground">{textoDaAcao(r.acao)}</span>
              {r.alvoRotulo &&
                (destino ? (
                  <Link href={destino} className="font-medium hover:underline">
                    {r.alvoRotulo}
                  </Link>
                ) : (
                  <span className="font-medium">{r.alvoRotulo}</span>
                ))}
              {temDetalhe && (
                <button
                  type="button"
                  onClick={() => setAberto(aberto === r.id ? null : r.id)}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  detalhes
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      aberto === r.id && "rotate-180"
                    )}
                  />
                </button>
              )}
            </div>

            {aberto === r.id && temDetalhe && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs">
                {JSON.stringify(r.detalhes, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: A página**

Crie `src/app/(admin)/admin/logs/page.tsx`:

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { listarLogs } from "@/server/services/activity-log-query";
import { ACOES, type TipoDeAlvo } from "@/lib/activity-log-actions";
import { ListaDeLogs } from "@/components/admin/logs/lista-de-logs";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Registro de atividade" };

// Histórico do que aconteceu no painel.
//
// O escopo vem de getActiveTenantIdForAdmin, nunca de parâmetro na URL: quem
// decide qual painel a pessoa enxerga é a sessão dela, e aceitar isso da
// querystring seria abrir a leitura de um painel pelo outro.
//
// SUPER_ADMIN vê todos, e é o único caso em que o filtro de tenant sai.

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    acao?: string;
    ator?: string;
    alvoTipo?: string;
    alvoId?: string;
    de?: string;
    ate?: string;
    cursor?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;

  const souDono = session.user.role === "SUPER_ADMIN";

  // Tipo de alvo conferido contra a lista fechada, não convertido na marra.
  // O valor vem da URL, e um cast aqui deixaria qualquer string virar filtro,
  // com o TypeScript dizendo que está tudo bem.
  const TIPOS: TipoDeAlvo[] = [
    "User",
    "Raffle",
    "Reservation",
    "Payment",
    "SkinTemplate",
    "Tenant",
  ];
  const tipoDeAlvo = TIPOS.find((t) => t === sp.alvoTipo);

  // O cursor viaja na URL como "<iso>|<id>". Data sozinha pularia registros
  // do mesmo instante, por isso o id vai junto.
  const cursor = (() => {
    if (!sp.cursor) return undefined;
    const [iso, id] = sp.cursor.split("|");
    if (!iso || !id) return undefined;
    const criadoEm = new Date(iso);
    return Number.isNaN(criadoEm.getTime()) ? undefined : { criadoEm, id };
  })();

  const { registros, proximo } = await listarLogs({
    tenantId: souDono ? null : tenantId,
    acao: sp.acao || undefined,
    actorId: sp.ator || undefined,
    alvo:
      tipoDeAlvo && sp.alvoId ? { tipo: tipoDeAlvo, id: sp.alvoId } : undefined,
    de: sp.de ? new Date(sp.de) : undefined,
    ate: sp.ate ? new Date(sp.ate) : undefined,
    cursor,
  });

  const paramsBase = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "cursor") paramsBase.set(k, v);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Registro de atividade
        </h1>
        <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>Registro</span>
        </nav>
      </header>

      {/* Formulário GET puro, como a busca de Usuários: o resultado vira URL,
          sobrevive ao recarregar e dá para mandar pra outra pessoa. */}
      <form method="GET" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ação
          <select
            name="acao"
            defaultValue={sp.acao ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          >
            <option value="">todas</option>
            {Object.entries(ACOES).map(([chave, texto]) => (
              <option key={chave} value={chave}>
                {texto}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          De
          <input
            type="date"
            name="de"
            defaultValue={sp.de ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Até
          <input
            type="date"
            name="ate"
            defaultValue={sp.ate ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          />
        </label>

        {/* O filtro por pessoa entra pela URL, clicando no nome numa linha.
            Repetir aqui como campo de texto pediria um cuid decorado, então o
            que a tela oferece é o caminho de volta. */}
        {sp.ator && <input type="hidden" name="ator" value={sp.ator} />}
        {sp.alvoTipo && <input type="hidden" name="alvoTipo" value={sp.alvoTipo} />}
        {sp.alvoId && <input type="hidden" name="alvoId" value={sp.alvoId} />}

        <button className={buttonVariants({ variant: "outline", size: "sm" })}>
          Filtrar
        </button>

        {(sp.ator || sp.alvoId) && (
          <Link
            href="/admin/logs"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Limpar recorte
          </Link>
        )}
      </form>

      <Card className="overflow-hidden p-0">
        <ListaDeLogs
          registros={registros.map((r) => ({
            id: r.id,
            criadoEm: r.criadoEm,
            origem: r.origem,
            actorId: r.actorId,
            actorName: r.actorName,
            actorRole: r.actorRole,
            acao: r.acao,
            alvoTipo: r.alvoTipo,
            alvoId: r.alvoId,
            alvoRotulo: r.alvoRotulo,
            detalhes: r.detalhes,
          }))}
        />
      </Card>

      {proximo && (
        <Link
          href={`/admin/logs?${paramsBase.toString()}${paramsBase.toString() ? "&" : ""}cursor=${encodeURIComponent(
            `${proximo.criadoEm.toISOString()}|${proximo.id}`
          )}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Carregar mais
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Entrada no menu**

Em `src/components/admin/admin-shell.tsx`, dentro de `NAV_GERAL`, logo depois da linha de Relatórios:

```tsx
  { href: "/admin/logs", label: "Registro", icon: ScrollText },
```

E acrescente `ScrollText` à lista de ícones importados de `lucide-react`.

- [ ] **Step 4: Atalho "ver histórico" na ficha do usuário**

Em `src/app/(admin)/admin/usuarios/[id]/editar/page.tsx`, no cabeçalho, ao lado do link "Voltar":

```tsx
        <Link
          href={`/admin/logs?alvoTipo=User&alvoId=${user.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Ver histórico desta conta
        </Link>
```

É por aqui que a consulta costuma começar de verdade: alguém está olhando para um registro e quer saber como ele chegou naquele estado.

- [ ] **Step 5: Atalho "ver histórico" na edição do sorteio**

Em `src/app/(admin)/admin/sorteios/[id]/editar/page.tsx`, no cabeçalho da página, o mesmo atalho apontando para o outro tipo de alvo:

```tsx
        <Link
          href={`/admin/logs?alvoTipo=Raffle&alvoId=${raffle.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Ver histórico deste sorteio
        </Link>
```

Use o nome de variável do sorteio que já existe na página. Se `Link` ainda não estiver importado ali, acrescente `import Link from "next/link";`.

- [ ] **Step 6: Conferir no navegador**

Run: `npm run dev`, entre no painel e abra `/admin/logs`.

Confira: a lista mostra as ações das tasks anteriores, o filtro por ação recorta e sobrevive ao recarregar, "Carregar mais" aparece quando há mais de 50 registros, e "detalhes" abre o antes e o depois.

- [ ] **Step 7: Typecheck, lint e testes**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: limpos.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(admin\)/admin/logs src/components/admin/logs src/components/admin/admin-shell.tsx src/app/\(admin\)/admin/usuarios src/app/\(admin\)/admin/sorteios
git commit -m "feat: tela de registro de atividade, com filtro e paginacao por cursor"
```

---

## Notas de execução

**A ordem importa até a Task 5.** As tasks 1 a 5 constroem a base e cada uma depende da anterior. Da 6 à 11 a ordem é livre: são pontos de instrumentação independentes, e cada uma entrega valor sozinha. A 12 precisa da 5.

**O que vai pular nesta máquina.** Os testes de integração (Task 6) pulam sem Postgres local, e os passos de verificação no navegador (Tasks 7 e 12) exigem que o `DATABASE_URL` aponte para um banco local antes de rodar. Se a base local não existir, marque esses passos como não verificados em vez de dá-los por bons.

**A migration só é aplicada no deploy.** `scripts/migrate-deploy.mjs` roda `prisma migrate deploy` quando `DIRECT_URL` existe, no escopo de Production. Até lá, o ambiente local precisa do banco próprio para exercitar qualquer coisa que escreva na tabela.
