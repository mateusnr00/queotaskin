import { describe, expect, it } from "vitest";

import { ordenarClientes, type Customer } from "./customers";

function cliente(parcial: Partial<Customer> & { name: string }): Customer {
  return {
    id: parcial.name.toLowerCase(),
    phone: null,
    email: null,
    cpf: null,
    role: "PARTICIPANT",
    createdAt: new Date("2026-01-01"),
    spent: 0,
    purchases: 0,
    tickets: 0,
    lastPurchaseAt: null,
    xp: 0,
    ...parcial,
  };
}

const nomes = (lista: Customer[]) => lista.map((c) => c.name);

describe("ordenarClientes", () => {
  it("quem gastou vem antes de quem não gastou, mesmo ordenando por nome", () => {
    // "Ana" ganharia de "Zeca" no alfabeto, mas ela nunca comprou.
    const r = ordenarClientes(
      [cliente({ name: "Ana" }), cliente({ name: "Zeca", spent: 10 })],
      "name",
    );
    expect(nomes(r)).toEqual(["Zeca", "Ana"]);
  });

  it("vale para todas as ordenações, não só uma", () => {
    for (const ordem of ["spent", "purchases", "name", "recent"] as const) {
      const r = ordenarClientes(
        [
          cliente({ name: "SemGasto" }),
          cliente({
            name: "Comprador",
            spent: 5,
            purchases: 1,
            lastPurchaseAt: new Date("2026-02-01"),
          }),
        ],
        ordem,
      );
      expect(nomes(r), `ordem ${ordem}`).toEqual(["Comprador", "SemGasto"]);
    }
  });

  it("entre quem não gastou, o cadastro mais recente vem primeiro", () => {
    const r = ordenarClientes(
      [
        cliente({ name: "Antiga", createdAt: new Date("2026-01-01") }),
        cliente({ name: "Nova", createdAt: new Date("2026-06-01") }),
        cliente({ name: "Media", createdAt: new Date("2026-03-01") }),
      ],
      "name",
    );
    expect(nomes(r)).toEqual(["Nova", "Media", "Antiga"]);
  });

  it("entre quem gastou, a ordenação pedida continua mandando", () => {
    const r = ordenarClientes(
      [
        cliente({ name: "Baixo", spent: 10 }),
        cliente({ name: "Alto", spent: 900 }),
        cliente({ name: "Medio", spent: 100 }),
      ],
      "spent",
    );
    expect(nomes(r)).toEqual(["Alto", "Medio", "Baixo"]);
  });

  it("gasto zero conta como não gastou, mesmo com pedido registrado", () => {
    // Sorteio gratuito gera pedido pago de valor zero. Ele não sustenta a
    // operação, então não deve empurrar comprador de verdade para baixo.
    const r = ordenarClientes(
      [
        cliente({ name: "Gratuito", spent: 0, purchases: 3 }),
        cliente({ name: "Pagante", spent: 1 }),
      ],
      "purchases",
    );
    expect(nomes(r)).toEqual(["Pagante", "Gratuito"]);
  });

  it("lista vazia e de um item não quebram", () => {
    expect(ordenarClientes([], "spent")).toEqual([]);
    expect(nomes(ordenarClientes([cliente({ name: "So" })], "spent"))).toEqual([
      "So",
    ]);
  });

  it("nenhum cliente some nem duplica na ordenação", () => {
    const entrada = [
      cliente({ name: "A", spent: 3 }),
      cliente({ name: "B" }),
      cliente({ name: "C", spent: 1 }),
      cliente({ name: "D" }),
    ];
    const r = ordenarClientes([...entrada], "spent");
    expect(r).toHaveLength(entrada.length);
    expect(nomes(r).sort()).toEqual(["A", "B", "C", "D"]);
  });
});
