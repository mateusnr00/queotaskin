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
