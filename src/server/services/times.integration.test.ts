import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  COR_VALIDA,
  TAG_VALIDA,
  contraste,
  textoSobreACor,
} from "@/lib/times-cs2";
import { listarTimesAtivos, mapaDeTimes } from "@/server/services/times";
import { integracaoLiberada } from "@/test/integration-setup";

const __suiteIntegra = integracaoLiberada ? describe : describe.skip;

// Os times saíram do código e viraram linhas da tabela Team. Estes testes
// substituem os que percorriam a constante: agora eles olham o DADO, que é
// onde o erro pode entrar, seja pela migration seja pelo painel.

__suiteIntegra("times cadastrados", () => {
  it("a migration levou a lista inteira, com os mesmos ids", async () => {
    // Os ids são a chave gravada em User.favoriteTeamId. Se a migration
    // tivesse gerado outros, todo mundo perderia o time em silêncio.
    const ids = (await prisma.team.findMany({ select: { id: true } })).map(
      (t) => t.id,
    );
    expect(ids.length).toBeGreaterThanOrEqual(30);
    for (const esperado of ["furia", "mibr", "pain", "navi", "faze", "g2"]) {
      expect(ids, `sumiu o id ${esperado}`).toContain(esperado);
    }
  });

  it("toda cor é hex de seis dígitos", async () => {
    // A cor entra num style inline. Valor quebrado não dá erro: o navegador
    // ignora e o emblema fica transparente, sem aviso nenhum.
    for (const t of await prisma.team.findMany()) {
      expect(COR_VALIDA.test(t.cor), `${t.nome} (${t.cor})`).toBe(true);
    }
  });

  it("toda tag cabe no emblema", async () => {
    for (const t of await prisma.team.findMany()) {
      expect(TAG_VALIDA.test(t.tag), `${t.nome} (${t.tag})`).toBe(true);
    }
  });

  it("todo time alcança 4.5:1 entre a tag e a cor de fundo", async () => {
    // A TAG é a identidade do time enquanto não houver escudo. Ilegível ali é
    // o mesmo que vazio. 4,5:1 e não 3:1 porque o texto é pequeno.
    for (const t of await prisma.team.findMany()) {
      const razao = contraste(t.cor, textoSobreACor(t.cor));
      expect(razao, `${t.nome} (${t.cor})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("nenhum escudo apontando para host de terceiro", async () => {
    // Escudo tem que morar no Storage do site. Puxar de raw.githubusercontent
    // quebra na primeira vez que o repositório de lá some, e exige liberar o
    // host no next.config.
    for (const t of await prisma.team.findMany()) {
      if (!t.escudo) continue;
      expect(t.escudo, t.nome).not.toMatch(/githubusercontent|github\.com/);
    }
  });

  it("o seletor público não mostra time desativado", async () => {
    const desativados = await prisma.team.count({ where: { ativo: false } });
    const ativos = await listarTimesAtivos();
    const total = await prisma.team.count();
    expect(ativos.length).toBe(total - desativados);
    expect(ativos.every((t) => t.regiao === "BR" || t.regiao === "INTER")).toBe(true);
  });

  it("o mapa INCLUI os desativados", async () => {
    // De propósito: quem já torcia por um time arquivado continua com o
    // emblema ao lado do nome, em vez de perder a identidade porque o painel
    // tirou o time do seletor depois.
    const mapa = await mapaDeTimes();
    expect(mapa.size).toBe(await prisma.team.count());
  });
});
