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

  it("não entra em recursão infinita com objeto que aponta para si mesmo", () => {
    const raso: Record<string, unknown> = { a: 1 };
    raso.eu = raso;
    expect(() => sanitizarDetalhes(raso)).not.toThrow();
  });
});
