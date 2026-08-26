import { describe, expect, it } from "vitest";

import { chavesDoLogin, ipDaRequisicao, limiteDe } from "./login-throttle";

describe("chavesDoLogin", () => {
  it("marca o tipo no prefixo, que é o que escolhe o limite", () => {
    expect(chavesDoLogin("203.0.113.7", "11144477735")).toEqual([
      "ip:203.0.113.7",
      "cpf:11144477735",
    ]);
  });

  it("sem IP, a proteção por conta continua valendo", () => {
    expect(chavesDoLogin(null, "11144477735")).toEqual(["cpf:11144477735"]);
  });
});

describe("limiteDe", () => {
  it("aperta na conta, que é o alvo do ataque", () => {
    expect(limiteDe("cpf:11144477735")).toBe(10);
  });

  it("afrouxa no IP, senão uma operadora inteira cai junto", () => {
    // Operadora de celular no Brasil compartilha endereço entre milhares de
    // assinantes. Igualar os dois limites transformaria o freio contra ataque
    // em bloqueio de cliente legítimo, então essa folga é proposital.
    expect(limiteDe("ip:203.0.113.7")).toBeGreaterThan(limiteDe("cpf:1"));
  });

  it("chave desconhecida cai no limite apertado, não no frouxo", () => {
    expect(limiteDe("sei-la:x")).toBe(10);
  });

  it("não se perde com IPv6, que tem dois-pontos no meio", () => {
    expect(limiteDe("ip:2001:db8::1")).toBe(limiteDe("ip:203.0.113.7"));
  });
});

describe("ipDaRequisicao", () => {
  it("pega o primeiro da cadeia, que é o cliente", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });
    expect(ipDaRequisicao(h)).toBe("203.0.113.7");
  });

  it("cai para x-real-ip quando não há cadeia", () => {
    expect(ipDaRequisicao(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9"
    );
  });

  it("sem cabeçalho nenhum devolve nulo em vez de inventar chave", () => {
    expect(ipDaRequisicao(new Headers())).toBeNull();
  });
});
