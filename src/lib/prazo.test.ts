import { describe, expect, it } from "vitest";

import { PRAZO_DE_ENTREGA_HORAS, situacaoDoPrazo } from "@/lib/prazo";

const HORA = 3_600_000;
const SORTEIO = new Date("2026-08-30T12:00:00Z");
const depois = (h: number) => new Date(SORTEIO.getTime() + h * HORA);

describe("situacaoDoPrazo", () => {
  it("o prazo prometido é de 72 horas", () => {
    expect(PRAZO_DE_ENTREGA_HORAS).toBe(72);
  });

  it("ainda não saiu e sobra tempo", () => {
    const s = situacaoDoPrazo(SORTEIO, null, depois(2))!;
    expect(s.estado).toBe("no_prazo");
    expect(s.rotulo).toBe("faltam 70h");
  });

  it("ainda não saiu e falta pouco muda de estado", () => {
    // 12h ou menos é quando ainda dá para correr, e a cor tem que avisar.
    expect(situacaoDoPrazo(SORTEIO, null, depois(60))!.estado).toBe("perto");
    expect(situacaoDoPrazo(SORTEIO, null, depois(59))!.estado).toBe("no_prazo");
  });

  it("passou das 72 horas sem sair: atrasada", () => {
    const s = situacaoDoPrazo(SORTEIO, null, depois(80))!;
    expect(s.estado).toBe("atrasada");
    expect(s.rotulo).toBe("atrasada 8h");
  });

  it("o atraso arredonda para CIMA", () => {
    // Uma hora e meia de atraso é "2h". Para baixo, o aviso ficaria mais
    // brando do que a realidade, que é o contrário do que ele serve.
    expect(situacaoDoPrazo(SORTEIO, null, depois(73.5))!.rotulo).toBe(
      "atrasada 2h",
    );
  });

  it("saiu dentro do prazo", () => {
    const s = situacaoDoPrazo(SORTEIO, depois(10), depois(200))!;
    expect(s.estado).toBe("cumprida");
    expect(s.rotulo).toBe("enviada em 10h");
  });

  it("saiu depois do prazo", () => {
    const s = situacaoDoPrazo(SORTEIO, depois(90), depois(200))!;
    expect(s.estado).toBe("estourada");
    expect(s.rotulo).toBe("enviada em 90h");
  });

  it("exatamente no limite ainda conta como cumprida", () => {
    expect(situacaoDoPrazo(SORTEIO, depois(72), depois(200))!.estado).toBe(
      "cumprida",
    );
    expect(situacaoDoPrazo(SORTEIO, depois(72.1), depois(200))!.estado).toBe(
      "estourada",
    );
  });

  it("depois que saiu, o relógio não muda mais o resultado", () => {
    // A entrega já aconteceu: olhar a tela amanhã não pode transformar uma
    // entrega cumprida em atrasada.
    const a = situacaoDoPrazo(SORTEIO, depois(10), depois(100))!;
    const b = situacaoDoPrazo(SORTEIO, depois(10), depois(10_000))!;
    expect(a).toEqual(b);
  });

  it("sem data de sorteio devolve nulo, e não um prazo inventado", () => {
    expect(situacaoDoPrazo(null, null, new Date())).toBeNull();
  });
});
