// Porta de entrada única dos testes de integração que ESCREVEM no banco.
//
// Em vez de cada arquivo reimplementar `isLocalDatabase()` (e quatro deles
// simplesmente não terem trava nenhuma, o que já gravou em produção), todos
// passam por aqui. `suiteDeIntegracao(nome, corpo)` só executa o corpo quando
// `assertSafeEnvironment()` prova as cinco camadas; caso contrário, SKIP.
//
// Skip, e não throw, para que `npm test` de rotina (sem o opt-in) rode os
// unitários e apenas PULE os destrutivos. Rodar de verdade exige, de forma
// explícita e consciente:
//   NODE_ENV=test ALLOW_DESTRUCTIVE_TESTS=true DATABASE_URL=<local c/ sentinela>
// Sem isso, nenhuma escrita acontece. Proteção por desenho, não por memória.

import { describe } from "vitest";

import { assertSafeEnvironment } from "./assert-safe-environment";

let diagnostico: string | null = null;
let liberado = false;
try {
  const d = assertSafeEnvironment();
  liberado = true;
  diagnostico = `banco de teste comprovado: ${d.host}/${d.banco}`;
} catch (e) {
  liberado = false;
  diagnostico = (e as Error).message;
}

/** Verdadeiro só quando a barreira liberou a escrita. */
export const integracaoLiberada = liberado;
export const diagnosticoDoAmbiente = diagnostico;

/**
 * `describe` que só roda com a barreira satisfeita. Uso:
 *   suiteDeIntegracao("serviço X (integração)", () => { it(...) });
 */
export function suiteDeIntegracao(nome: string, corpo: () => void): void {
  if (liberado) {
    describe(nome, corpo);
  } else {
    describe.skip(`${nome} [PULADO: ${diagnostico}]`, corpo);
  }
}
