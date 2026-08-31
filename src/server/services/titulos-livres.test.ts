import { describe, expect, it } from "vitest";

import {
  sortearTitulosLivres,
  type ConsultaDeTitulos,
} from "@/server/services/titulos-livres";

// Um banco de mentira: o conjunto de ocupados mora aqui e as duas consultas
// leem dele. Conta quantas vezes cada uma foi chamada, porque o ponto do
// algoritmo é justamente NÃO varrer a campanha quando não precisa.
function bancoFalso(total: number, ocupados: number[]) {
  const donos = new Set(ocupados);
  const chamadas = { amostra: 0, varredura: 0 };
  const consulta: ConsultaDeTitulos = {
    async ocupadosEntre(candidatos) {
      chamadas.amostra++;
      return new Set(candidatos.filter((c) => donos.has(c)));
    },
    async livresVarrendo(limite) {
      chamadas.varredura++;
      const livres: number[] = [];
      for (let n = 1; n <= total && livres.length < limite; n++) {
        if (!donos.has(n)) livres.push(n);
      }
      return livres;
    },
  };
  return { consulta, chamadas, donos };
}

/** Sequência fixa de "sorteios", para o teste não depender da sorte. */
function dado(valores: number[]) {
  let i = 0;
  return () => valores[i++ % valores.length]!;
}

describe("sortearTitulosLivres", () => {
  it("nunca devolve um número que já tem dono", async () => {
    // O defeito que motivou tudo: numa campanha quase vendida, o sorteio caía
    // em número vendido e o prêmio nascia sem poder pagar ninguém.
    const vendidos = Array.from({ length: 95 }, (_, i) => i + 1); // 1..95
    const { consulta } = bancoFalso(100, vendidos);
    const r = await sortearTitulosLivres({
      total: 100,
      quantidade: 3,
      evitar: new Set(),
      consulta,
    });
    expect(r).toHaveLength(3);
    for (const n of r) expect(n).toBeGreaterThan(95);
  });

  it("respeita os números que já estão na lista", async () => {
    const { consulta } = bancoFalso(100, [98, 99, 100]);
    const r = await sortearTitulosLivres({
      total: 100,
      quantidade: 5,
      evitar: new Set([1, 2, 3, 4, 5]),
      consulta,
    });
    expect(r).toHaveLength(5);
    for (const n of r) expect([1, 2, 3, 4, 5, 98, 99, 100]).not.toContain(n);
  });

  it("não repete número dentro do mesmo pedido", async () => {
    const { consulta } = bancoFalso(50, []);
    const r = await sortearTitulosLivres({
      total: 50,
      quantidade: 10,
      evitar: new Set(),
      consulta,
    });
    expect(new Set(r).size).toBe(10);
  });

  it("com campanha vazia, resolve na amostragem e não varre nada", async () => {
    // A varredura existe para o caso ruim. Chamá-la sempre significaria ler a
    // campanha inteira do banco a cada clique no botão.
    const { consulta, chamadas } = bancoFalso(1_000_000, []);
    const r = await sortearTitulosLivres({
      total: 1_000_000,
      quantidade: 1,
      evitar: new Set(),
      consulta,
    });
    expect(r).toHaveLength(1);
    expect(chamadas.amostra).toBe(1);
    expect(chamadas.varredura).toBe(0);
  });

  it("campanha lotada: acha o único livre que sobrou", async () => {
    // 999 de mil vendidos. A sorte não acha o 777 em oito rodadas, e é aqui
    // que a varredura ganha o dia.
    const vendidos = Array.from({ length: 1000 }, (_, i) => i + 1).filter(
      (n) => n !== 777,
    );
    const { consulta, chamadas } = bancoFalso(1000, vendidos);
    const r = await sortearTitulosLivres({
      total: 1000,
      quantidade: 1,
      evitar: new Set(),
      consulta,
    });
    expect(r).toEqual([777]);
    expect(chamadas.varredura).toBe(1);
  });

  it("esgotado devolve menos do que foi pedido, sem inventar número", async () => {
    // Quem chama decide o que dizer. O que não pode é completar a cota com
    // número ocupado só para entregar a quantidade pedida.
    const todos = Array.from({ length: 10 }, (_, i) => i + 1);
    const { consulta } = bancoFalso(10, todos);
    const r = await sortearTitulosLivres({
      total: 10,
      quantidade: 3,
      evitar: new Set(),
      consulta,
    });
    expect(r).toEqual([]);
  });

  it("na varredura ainda sorteia, não entrega sempre o menor", async () => {
    // Se pegasse o primeiro livre, toda campanha lotada teria seus títulos
    // premiados amontoados no começo da faixa, e isso é padrão que se decora.
    const vendidos = Array.from({ length: 100 }, (_, i) => i + 1).filter(
      (n) => n !== 40 && n !== 60 && n !== 80,
    );
    const { consulta } = bancoFalso(100, vendidos);
    // O dado devolve sempre ~0,9: na varredura isso é o último da lista.
    const r = await sortearTitulosLivres(
      { total: 100, quantidade: 1, evitar: new Set(), consulta },
      dado([0.9]),
    );
    expect(r).toEqual([80]);
  });

  it("quantidade zero não consulta o banco", async () => {
    const { consulta, chamadas } = bancoFalso(100, []);
    const r = await sortearTitulosLivres({
      total: 100,
      quantidade: 0,
      evitar: new Set(),
      consulta,
    });
    expect(r).toEqual([]);
    expect(chamadas.amostra + chamadas.varredura).toBe(0);
  });
});
