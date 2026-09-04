import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// A CAIXA E A RASPADINHA ANDAM JUNTAS.
//
// As duas são a mesma mecânica com nome diferente: pagamento confirmado gera
// as unidades, e quem comprou abre. Só que a confirmação chega por seis
// caminhos (quatro webhooks, a reconsulta de status e a aprovação no painel),
// e a raspadinha tinha sido ligada em três deles. O resultado é o pior tipo de
// defeito: silencioso e dependente do gateway. Quem pagava pelos webhooks
// certos recebia raspadinha; quem pagava pelos outros comprava vinte e cinco
// títulos e não recebia nenhuma, com as caixas surpresas da mesma compra
// chegando normalmente.
//
// O teste é de código-fonte, e não de comportamento, porque o defeito é de
// código-fonte: nada quebra, nada lança, uma linha simplesmente não existe num
// arquivo. Só ler os arquivos pega isso.

const CAIXA = "autoGenerateSurpriseBoxesForReservation(";
const RASPADINHA = "gerarRaspadinhasParaReserva(";

const RAIZ = join(__dirname, "..", "..");
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

describe("geração de caixas e raspadinhas", () => {
  it("todo caminho que gera caixa também gera raspadinha", () => {
    const faltando: string[] = [];
    for (const caminho of arquivos(RAIZ)) {
      if (caminho.endsWith(".test.ts") || caminho.endsWith(".test.tsx")) {
        continue;
      }
      const texto = readFileSync(caminho, "utf8");
      // O próprio serviço da caixa não gera raspadinha, e nem deveria.
      if (
        caminho.endsWith("surprise-boxes.ts") &&
        texto.includes(
          "export async function autoGenerateSurpriseBoxesForReservation",
        )
      ) {
        continue;
      }
      if (texto.includes(CAIXA) && !texto.includes(RASPADINHA)) {
        faltando.push(caminho.replace(RAIZ, "src"));
      }
    }
    expect(faltando).toEqual([]);
  });

  it("os caminhos de confirmação chegam aos efeitos, agora centralizados", () => {
    // A geração passou a ser DRY: os quatro webhooks delegam ao handler
    // central (payment-webhook.ts), que chama os efeitos; a reconsulta de
    // status (pix.ts) e a aprovação no painel (reservations.ts) mantêm os
    // seus. Se um deles sumir, o defeito silencioso volta. O teste garante:
    //   (a) as três FONTES de efeito existem;
    //   (b) as quatro rotas de webhook delegam ao handler central.
    const fontes = arquivos(RAIZ).filter(
      (c) => !c.endsWith(".test.ts") && !c.endsWith("raspadinhas.ts") &&
        readFileSync(c, "utf8").includes(RASPADINHA),
    );
    expect(fontes.length).toBeGreaterThanOrEqual(3);

    const rotasDeWebhook = arquivos(join(RAIZ, "app", "api", "webhooks")).filter(
      (c) => c.endsWith("route.ts"),
    );
    expect(rotasDeWebhook.length).toBe(4);
    for (const rota of rotasDeWebhook) {
      expect(
        readFileSync(rota, "utf8").includes("processarWebhookDePagamento"),
        `${rota} deve delegar ao handler central`,
      ).toBe(true);
    }
  });
});
