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
