import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Skills instaladas por `npx skills add`. São código de terceiro que
    // orienta o agente, não fonte do projeto: os .cjs delas usam require(),
    // que a regra do Next proíbe, e quinze erros alheios num lint que estava
    // limpo escondem o próximo erro que for nosso.
    ".agents/**",
    ".claude/**",
    // Componentes do Tremor vendorizados (data-viz), copiados do repo oficial
    // (MIT) em src/components/ui/tremor. Os padrões de hook do upstream
    // reprovam nas regras do react-hooks do Next, e não editamos código de
    // terceiro. Só o chartColors.ts (a ponte de tema) foi adaptado por nós, e
    // ele passa no lint normalmente.
    "src/components/ui/tremor/**",
  ]),
]);

export default eslintConfig;
