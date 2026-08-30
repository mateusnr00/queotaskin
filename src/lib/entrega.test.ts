import { describe, expect, it } from "vitest";

import {
  ESTADOS_DA_ENTREGA,
  estadoDaEntrega,
  pendente,
} from "@/lib/entrega";

describe("estados da entrega", () => {
  it("tem os seis estados, sem repetir chave", () => {
    const chaves = ESTADOS_DA_ENTREGA.map((e) => e.chave);
    expect(chaves).toEqual([
      "PRIORIDADE",
      "AGUARDANDO",
      "ENVIADO",
      "ERRO",
      "REENVIO",
      "PIX",
    ]);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("só ENVIADO e PIX tiram a entrega da fila", () => {
    // Pix é prêmio pago em dinheiro: não há mais nada a enviar, então ele
    // conclui do mesmo jeito. Erro e Reenvio continuam dando trabalho.
    const concluidos = ESTADOS_DA_ENTREGA.filter((e) => e.concluido).map(
      (e) => e.chave,
    );
    expect(concluidos).toEqual(["ENVIADO", "PIX"]);
    expect(pendente("ERRO")).toBe(true);
    expect(pendente("REENVIO")).toBe(true);
    expect(pendente("PRIORIDADE")).toBe(true);
    expect(pendente("ENVIADO")).toBe(false);
    expect(pendente("PIX")).toBe(false);
  });

  it("toda cor é hex de seis dígitos", () => {
    for (const e of ESTADOS_DA_ENTREGA) {
      expect(e.cor, e.rotulo).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("estado desconhecido não derruba a linha", () => {
    // O banco pode ganhar um valor novo antes desta lista. Cair em Aguardando
    // é melhor do que renderizar uma linha sem rótulo nenhum.
    // @ts-expect-error valor de propósito fora do enum
    expect(estadoDaEntrega("QUALQUER_COISA").chave).toBe("AGUARDANDO");
  });
});
