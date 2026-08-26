import { describe, expect, it } from "vitest";

import {
  OMITIDO,
  diferencas,
  mascararCpf,
  sanitizarDetalhes,
} from "./activity-log-detalhes";

describe("diferencas", () => {
  it("guarda só o que mudou, não o registro inteiro", () => {
    const d = diferencas(
      { nome: "Maria", papel: "PARTICIPANT", email: "m@x.com" },
      { nome: "Maria", papel: "ADMIN", email: "m@x.com" }
    );
    expect(d).toEqual({ antes: { papel: "PARTICIPANT" }, depois: { papel: "ADMIN" } });
  });

  it("nada mudou devolve os dois lados vazios", () => {
    const d = diferencas({ a: 1 }, { a: 1 });
    expect(d).toEqual({ antes: {}, depois: {} });
  });

  it("valor igual dos dois lados não entra, nem quando é null", () => {
    const d = diferencas({ email: null }, { email: null });
    expect(d.depois).toEqual({});
  });

  it("string vazia e null CONTAM como mudança: normalizar é de quem chama", () => {
    // O formulário manda "" onde o banco tem null, e aqui isso é mudança de
    // verdade. Quem chama normaliza antes (`email || null` em users.ts),
    // senão salvar sem mexer em nada geraria registro toda vez. Deixar a
    // regra aqui esconderia o "" legítimo de quem apagou um campo.
    const d = diferencas({ email: null }, { email: "" });
    expect(d.depois).toEqual({ email: "" });
  });

  it("chave apagada aparece como null, senão a remoção some do histórico", () => {
    const d = diferencas({ a: 1, b: 2 }, { a: 1 });
    expect(d.antes).toEqual({ b: 2 });
    expect(d.depois).toEqual({ b: null });
  });

  it("mesmo conteúdo em instâncias diferentes não conta como mudança", () => {
    // Campo Json do Prisma volta como objeto novo a cada leitura. Comparar
    // por referência marcaria mudança em campo que ninguém tocou.
    const d = diferencas({ cfg: { x: 1 } }, { cfg: { x: 1 } });
    expect(d.depois).toEqual({});
  });
});

describe("mascararCpf", () => {
  it("mostra só o fim, o bastante para conferir que é a mesma pessoa", () => {
    expect(mascararCpf("11144477735")).toBe("***.***.777-35");
  });

  it("entrada fora do formato não vaza o que veio", () => {
    expect(mascararCpf("123")).toBe("***");
  });
});

describe("sanitizarDetalhes", () => {
  it("some com campo de segredo em qualquer nível", () => {
    const limpo = sanitizarDetalhes({
      antes: { passwordHash: "$2a$10$abc" },
      depois: { clientSecret: "sk_live_123", provider: "SYNCPAY" },
    }) as Record<string, Record<string, unknown>>;

    expect(limpo.antes.passwordHash).toBe(OMITIDO);
    expect(limpo.depois.clientSecret).toBe(OMITIDO);
    expect(limpo.depois.provider).toBe("SYNCPAY");
  });

  it("mascara CPF dos dois lados da mudança", () => {
    const limpo = sanitizarDetalhes({
      antes: { cpf: "11144477735" },
      depois: { cpf: "52998224725" },
    }) as Record<string, Record<string, unknown>>;

    expect(limpo.antes.cpf).toBe("***.***.777-35");
    expect(limpo.depois.cpf).toBe("***.***.247-25");
  });

  it("preserva lista e valores simples", () => {
    expect(sanitizarDetalhes({ numeros: [1, 2, 3], o_que: "capa" })).toEqual({
      numeros: [1, 2, 3],
      o_que: "capa",
    });
  });

  it("CPF que chega como número também sai mascarado", () => {
    const limpo = sanitizarDetalhes({ cpf: 11144477735 }) as Record<string, unknown>;
    expect(limpo.cpf).toBe("***.***.777-35");
  });

  it("campo cpf com valor ilegível sai omitido, não cru", () => {
    const limpo = sanitizarDetalhes({ cpf: { estranho: true } }) as Record<string, unknown>;
    expect(limpo.cpf).toBe(OMITIDO);
  });

  it("o link de troca da Steam fica de fora: o token viaja no valor", () => {
    const limpo = sanitizarDetalhes({
      steamTradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=1&token=SEGREDO",
    }) as Record<string, unknown>;
    expect(limpo.steamTradeUrl).toBe(OMITIDO);
  });

  it("objeto reusado em dois ramos não vira omitido no segundo", () => {
    const compartilhado = { info: "valor legitimo" };
    const limpo = sanitizarDetalhes({
      ramoA: compartilhado,
      ramoB: compartilhado,
    }) as Record<string, unknown>;
    expect(limpo.ramoA).toEqual({ info: "valor legitimo" });
    expect(limpo.ramoB).toEqual({ info: "valor legitimo" });
  });

  it("ciclo vira omitido no ponto que volta, sem laço infinito", () => {
    const raso: Record<string, unknown> = { a: 1 };
    raso.eu = raso;
    const limpo = sanitizarDetalhes(raso) as Record<string, unknown>;
    expect(limpo.a).toBe(1);
    expect(limpo.eu).toBe(OMITIDO);
  });
});
