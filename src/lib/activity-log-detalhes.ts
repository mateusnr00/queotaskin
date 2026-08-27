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
  // O link de troca da Steam carrega o token no próprio valor
  // (...&token=...), e nenhum radical acima casa com o nome do campo. A
  // detecção por nome não enxerga segredo dentro de string, então aqui o
  // campo inteiro fica de fora. É a limitação conhecida deste método: nome
  // inocente com segredo embutido no valor passa, e só revisão pega.
  "tradeurl",
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
 * JSON com as chaves em ordem alfabética, em qualquer profundidade.
 *
 * JSON.stringify puro é sensível à ordem das chaves, e campo Json do Prisma
 * volta do Postgres com a ordem que o jsonb canonicalizou, que não é a ordem
 * em que o formulário mandou. Sem isto, um campo que ninguém tocou aparece
 * como mudança em todo salvamento.
 */
function jsonCanonico(valor: unknown): string {
  return JSON.stringify(valor, (_chave, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]])
        )
      : v
  );
}

/**
 * Dois valores são diferentes?
 *
 * Object.is sozinho compara objeto por REFERÊNCIA, e campo Json do Prisma
 * volta como instância nova a cada leitura: sem o desvio abaixo, todo
 * salvamento marcaria "mudou" num campo que ninguém tocou.
 */
function mudou(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return false;
  if (a && b && typeof a === "object" && typeof b === "object") {
    try {
      return jsonCanonico(a) !== jsonCanonico(b);
    } catch {
      // Ciclo ou valor que não serializa: assume que mudou. Errar para o
      // lado de registrar demais é melhor que perder a mudança.
      return true;
    }
  }
  return true;
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

  // A UNIÃO das chaves dos dois lados. Percorrer só `depois` perdia a chave
  // APAGADA, que é justamente a mudança que mais interessa registrar.
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);

  for (const chave of chaves) {
    if (!mudou(antes[chave], depois[chave])) continue;
    // Ausência vira null explícito: undefined some no JSON.stringify que o
    // Prisma faz ao gravar Json, e a remoção ficaria invisível de novo.
    a[chave] = chave in antes ? antes[chave] : null;
    d[chave] = chave in depois ? depois[chave] : null;
  }

  return { antes: a, depois: d };
}

/** Remove segredo e mascara CPF, em qualquer profundidade. */
export function sanitizarDetalhes(
  valor: unknown,
  profundidade = 0,
  ancestrais: WeakSet<object> = new WeakSet()
): unknown {
  if (profundidade > PROFUNDIDADE_MAXIMA) return OMITIDO;
  if (valor === null || typeof valor !== "object") return valor;

  // Só os ANCESTRAIS do caminho atual entram, e saem na volta. Guardar tudo
  // o que já foi visto trataria reuso legítimo, o mesmo objeto pendurado em
  // dois ramos, como se fosse ciclo: o segundo ramo viraria [omitido], e a
  // auditoria perderia dado por causa de uma proteção que não era para ele.
  if (ancestrais.has(valor as object)) return OMITIDO;
  ancestrais.add(valor as object);

  try {
    if (Array.isArray(valor)) {
      return valor.map((item) =>
        sanitizarDetalhes(item, profundidade + 1, ancestrais)
      );
    }

    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      if (ehSegredo(chave)) {
        saida[chave] = OMITIDO;
        continue;
      }
      if (ehCpf(chave)) {
        // Sem checar se é texto antes: um CPF que chegue como número cairia
        // no caminho comum e sairia inteiro. Campo chamado cpf com valor que
        // não é texto nem número é coisa que não se sabe ler, e o que não se
        // sabe ler não se grava.
        saida[chave] =
          typeof item === "string" || typeof item === "number"
            ? mascararCpf(String(item))
            : OMITIDO;
        continue;
      }
      saida[chave] = sanitizarDetalhes(item, profundidade + 1, ancestrais);
    }
    return saida;
  } finally {
    ancestrais.delete(valor as object);
  }
}
