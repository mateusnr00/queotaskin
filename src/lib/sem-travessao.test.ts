import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// O travessão foi retirado do projeto inteiro por decisão de marca: em texto
// de site brasileiro ele soa a conteúdo gerado por IA, e o público de rifa
// percebe isso. No lugar dele: vírgula para aparte, dois-pontos para
// explicação, ponto para frase nova.
//
// Este teste existe porque a regra é fácil de furar sem ninguém notar. Um
// travessão volta numa mensagem de erro, numa descrição de campanha ou num
// comentário copiado de outro lugar, e ninguém revisa cada linha.
//
// O caractere é montado pelo código Unicode de propósito: escrito literal,
// este arquivo reprovaria a si mesmo.
const TRAVESSAO = String.fromCharCode(0x2014);

const RAIZ = join(__dirname, "..");
const PASTAS = ["app", "components", "lib", "server", "types"];
const EXTENSOES = [".ts", ".tsx"];

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      saida.push(...arquivos(caminho));
    } else if (EXTENSOES.some((e) => nome.endsWith(e))) {
      saida.push(caminho);
    }
  }
  return saida;
}

describe("travessao", () => {
  it("nao aparece em nenhum arquivo de src", () => {
    const culpados: string[] = [];
    for (const pasta of PASTAS) {
      for (const arquivo of arquivos(join(RAIZ, pasta))) {
        readFileSync(arquivo, "utf8")
          .split("\n")
          .forEach((linha, i) => {
            if (!linha.includes(TRAVESSAO)) return;
            culpados.push(
              `${arquivo.replace(RAIZ + "/", "")}:${i + 1}  ${linha.trim().slice(0, 70)}`
            );
          });
      }
    }
    expect(culpados, `\n${culpados.join("\n")}\n`).toHaveLength(0);
  });
});
