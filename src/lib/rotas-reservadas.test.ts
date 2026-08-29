import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ROTAS_DO_SITE_RESERVADAS,
  desviarDeReservado,
  slugReservado,
} from "./rotas-reservadas";

describe("slugs reservados", () => {
  it("reconhece rota do site, com espaço e maiúscula", () => {
    expect(slugReservado("login")).toBe(true);
    expect(slugReservado("  LOGIN ")).toBe(true);
    expect(slugReservado("meus-titulos")).toBe(true);
    expect(slugReservado("s")).toBe(true);
  });

  it("deixa passar slug de campanha", () => {
    expect(slugReservado("ak-47-redline-field-tested")).toBe(false);
    expect(slugReservado("awp-dragon-lore")).toBe(false);
  });

  it("reserva o singular e o plural de sorteio", () => {
    // "sorteio" no singular passou a ser rota quando a transmissão ao vivo
    // ganhou endereço próprio (/sorteio/DRW-...). Antes ele era um slug
    // válido, e este teste afirmava o contrário.
    expect(slugReservado("sorteio")).toBe(true);
    expect(slugReservado("sorteios")).toBe(true);
  });

  it("desvia com sufixo em vez de recusar", () => {
    expect(desviarDeReservado("login")).toBe("login-sorteio");
    expect(desviarDeReservado("awp-dragon-lore")).toBe("awp-dragon-lore");
  });

  // Este é o teste que importa de verdade. A lista é escrita à mão, e uma
  // rota nova adicionada meses depois não avisa ninguém que precisa entrar
  // nela. Aqui a estrutura de pastas cobra: sem isso, criar src/app/(public)/
  // ganhadores/ tornaria uma campanha com esse slug inalcançável em silêncio.
  it("cobre todo primeiro segmento de rota que existe em src/app", () => {
    const raiz = join(process.cwd(), "src", "app");
    const segmentos = new Set<string>();

    for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      const nome = entrada.name;
      // Grupo de rota: (public), (admin), (auth). Não aparece na URL, então
      // o que conta são os filhos dele.
      if (nome.startsWith("(") && nome.endsWith(")")) {
        for (const filho of readdirSync(join(raiz, nome), {
          withFileTypes: true,
        })) {
          if (filho.isDirectory()) segmentos.add(filho.name);
        }
        continue;
      }
      segmentos.add(nome);
    }

    // Segmento dinâmico ([slug]) é justamente a rota da campanha.
    const estaticos = [...segmentos].filter((s) => !s.startsWith("["));
    const faltando = estaticos.filter(
      (s) => !ROTAS_DO_SITE_RESERVADAS.includes(s)
    );
    expect(faltando, `rotas fora da lista de reservadas: ${faltando}`).toEqual(
      []
    );
  });
});
