import { describe, expect, it } from "vitest";

import {
  bpsDaPorcentagem,
  bpsDoValorDoCupom,
  calcularRecompensa,
  codigoSugerido,
  codigoValido,
  conferirConfig,
  descontoDoCupom,
  emCentavos,
  linkDeIndicacao,
  normalizarCodigo,
  porcentagemDosBps,
  valorDoCupom,
  CONFIG_PADRAO,
} from "@/lib/afiliados";

describe("calcularRecompensa", () => {
  const limiar = 1000;

  it("R$ 9,99 não gera cupom, e o centavo fica guardado", () => {
    expect(
      calcularRecompensa({
        progressoAnterior: 0,
        valorEmCentavos: 999,
        limiarEmCentavos: limiar,
      }),
    ).toEqual({ cupons: 0, progressoRestante: 999 });
  });

  it("R$ 10,00 gera um cupom e zera o progresso", () => {
    expect(
      calcularRecompensa({
        progressoAnterior: 0,
        valorEmCentavos: 1000,
        limiarEmCentavos: limiar,
      }),
    ).toEqual({ cupons: 1, progressoRestante: 0 });
  });

  it("R$ 20,00 gera DOIS cupons, e não um de valor dobrado", () => {
    expect(
      calcularRecompensa({
        progressoAnterior: 0,
        valorEmCentavos: 2000,
        limiarEmCentavos: limiar,
      }),
    ).toEqual({ cupons: 2, progressoRestante: 0 });
  });

  it("R$ 27,50 gera dois cupons e deixa R$ 7,50", () => {
    expect(
      calcularRecompensa({
        progressoAnterior: 0,
        valorEmCentavos: 2750,
        limiarEmCentavos: limiar,
      }),
    ).toEqual({ cupons: 2, progressoRestante: 750 });
  });

  it("mais R$ 2,50 sobre os R$ 7,50 fecham o terceiro", () => {
    expect(
      calcularRecompensa({
        progressoAnterior: 750,
        valorEmCentavos: 250,
        limiarEmCentavos: limiar,
      }),
    ).toEqual({ cupons: 1, progressoRestante: 0 });
  });

  it("indicados diferentes somam no mesmo progresso", () => {
    // R$ 4 de um, R$ 6 de outro: um cupom.
    const primeiro = calcularRecompensa({
      progressoAnterior: 0,
      valorEmCentavos: 400,
      limiarEmCentavos: limiar,
    });
    const segundo = calcularRecompensa({
      progressoAnterior: primeiro.progressoRestante,
      valorEmCentavos: 600,
      limiarEmCentavos: limiar,
    });
    expect(primeiro.cupons).toBe(0);
    expect(segundo).toEqual({ cupons: 1, progressoRestante: 0 });
  });

  it("não perde centavo em cem entradas de um centavo", () => {
    let progresso = 0;
    let cupons = 0;
    for (let i = 0; i < 100; i++) {
      const r = calcularRecompensa({
        progressoAnterior: progresso,
        valorEmCentavos: 1,
        limiarEmCentavos: limiar,
      });
      progresso = r.progressoRestante;
      cupons += r.cupons;
    }
    expect(cupons).toBe(0);
    expect(progresso).toBe(100);
  });

  it("estorno maior que o progresso vira dívida explícita", () => {
    // Progresso negativo é de propósito: some do painel de quem divulga e
    // aparece no administrativo, e o próximo dinheiro real quita antes de
    // gerar cupom novo.
    expect(
      calcularRecompensa({
        progressoAnterior: 200,
        valorEmCentavos: -1000,
        limiarEmCentavos: limiar,
      }),
    ).toEqual({ cupons: 0, progressoRestante: -800 });
  });

  it("limiar personalizado muda a conta", () => {
    expect(
      calcularRecompensa({
        progressoAnterior: 0,
        valorEmCentavos: 5000,
        limiarEmCentavos: 2000,
      }),
    ).toEqual({ cupons: 2, progressoRestante: 1000 });
  });

  it("recusa limiar zero em vez de dividir por ele", () => {
    expect(() =>
      calcularRecompensa({
        progressoAnterior: 0,
        valorEmCentavos: 1000,
        limiarEmCentavos: 0,
      }),
    ).toThrow();
  });
});

describe("valor do cupom e porcentagem", () => {
  it("o padrão é 50%: R$ 10 de limiar dão cupom de R$ 5", () => {
    expect(CONFIG_PADRAO.limiarEmCentavos).toBe(1000);
    expect(CONFIG_PADRAO.recompensaEmBps).toBe(5000);
    expect(CONFIG_PADRAO.valorDoCupomEmCentavos).toBe(500);
    expect(valorDoCupom(1000, 5000)).toBe(500);
  });

  it("70% dão cupom de R$ 7", () => {
    expect(valorDoCupom(1000, 7000)).toBe(700);
  });

  it("100% dão cupom do valor do limiar", () => {
    expect(valorDoCupom(1000, 10_000)).toBe(1000);
  });

  it("arredonda para baixo, para não pagar centavo a mais", () => {
    // 33,33% de R$ 10 é R$ 3,333: sai R$ 3,33.
    expect(valorDoCupom(1000, 3333)).toBe(333);
  });

  it("o caminho de volta: R$ 7 num limiar de R$ 10 são 70%", () => {
    expect(bpsDoValorDoCupom(1000, 700)).toBe(7000);
    expect(porcentagemDosBps(7000)).toBe(70);
    expect(bpsDaPorcentagem(70)).toBe(7000);
    expect(bpsDaPorcentagem(7.5)).toBe(750);
  });
});

describe("conferirConfig", () => {
  it("aceita a configuração padrão", () => {
    expect(conferirConfig(CONFIG_PADRAO)).toBeNull();
  });

  it("recusa limiar zero", () => {
    expect(
      conferirConfig({
        limiarEmCentavos: 0,
        recompensaEmBps: 5000,
        valorDoCupomEmCentavos: 0,
      })?.campo,
    ).toBe("limiar");
  });

  it("recusa valores negativos", () => {
    expect(
      conferirConfig({
        limiarEmCentavos: -100,
        recompensaEmBps: 5000,
        valorDoCupomEmCentavos: 500,
      }),
    ).not.toBeNull();
    expect(
      conferirConfig({
        limiarEmCentavos: 1000,
        recompensaEmBps: -1,
        valorDoCupomEmCentavos: 500,
      }),
    ).not.toBeNull();
  });

  it("recusa cupom zerado", () => {
    expect(
      conferirConfig({
        limiarEmCentavos: 1000,
        recompensaEmBps: 1,
        valorDoCupomEmCentavos: 0,
      })?.campo,
    ).toBe("valor");
  });

  it("recusa recompensa acima de 100%", () => {
    expect(
      conferirConfig({
        limiarEmCentavos: 1000,
        recompensaEmBps: 12_000,
        valorDoCupomEmCentavos: 1200,
      })?.campo,
    ).toBe("bps");
  });

  it("recusa valor que não bate com a porcentagem", () => {
    // É a conferência que impede a tela desatualizada de gravar um cupom
    // valendo diferente do que o painel prometeu.
    expect(
      conferirConfig({
        limiarEmCentavos: 1000,
        recompensaEmBps: 5000,
        valorDoCupomEmCentavos: 700,
      })?.campo,
    ).toBe("valor");
  });
});

describe("descontoDoCupom", () => {
  it("cota de R$ 2 com cupom de R$ 5: abate R$ 2 e perde R$ 3", () => {
    expect(
      descontoDoCupom({
        precoDaCotaEmCentavos: 200,
        valorDoCupomEmCentavos: 500,
      }),
    ).toEqual({ descontoEmCentavos: 200, desperdicioEmCentavos: 300 });
  });

  it("cota de R$ 5 com cupom de R$ 5: cobre exato, sem sobra", () => {
    expect(
      descontoDoCupom({
        precoDaCotaEmCentavos: 500,
        valorDoCupomEmCentavos: 500,
      }),
    ).toEqual({ descontoEmCentavos: 500, desperdicioEmCentavos: 0 });
  });

  it("cota de R$ 12 com cupom de R$ 5: abate R$ 5 e cobra o resto", () => {
    expect(
      descontoDoCupom({
        precoDaCotaEmCentavos: 1200,
        valorDoCupomEmCentavos: 500,
      }),
    ).toEqual({ descontoEmCentavos: 500, desperdicioEmCentavos: 0 });
  });

  it("cota de R$ 100 com cupom de R$ 5: abate os R$ 5", () => {
    expect(
      descontoDoCupom({
        precoDaCotaEmCentavos: 10_000,
        valorDoCupomEmCentavos: 500,
      }).descontoEmCentavos,
    ).toBe(500);
  });

  it("cupom de R$ 7 abate R$ 7", () => {
    expect(
      descontoDoCupom({
        precoDaCotaEmCentavos: 1200,
        valorDoCupomEmCentavos: 700,
      }).descontoEmCentavos,
    ).toBe(700);
  });

  it("o desconto nunca passa do preço da cota: não existe saldo", () => {
    const { descontoEmCentavos, desperdicioEmCentavos } = descontoDoCupom({
      precoDaCotaEmCentavos: 100,
      valorDoCupomEmCentavos: 500,
    });
    expect(descontoEmCentavos).toBe(100);
    expect(desperdicioEmCentavos).toBe(400);
  });

  it("campanha sem preço não gera desconto", () => {
    expect(
      descontoDoCupom({
        precoDaCotaEmCentavos: 0,
        valorDoCupomEmCentavos: 500,
      }).descontoEmCentavos,
    ).toBe(0);
  });
});

describe("normalizarCodigo", () => {
  it("tira acento, espaço e caixa", () => {
    expect(normalizarCodigo(" mateus 7k ")).toBe("MATEUS7K");
    expect(normalizarCodigo("joão_10")).toBe("JOAO_10");
  });

  it("descarta pontuação que não dá para ditar", () => {
    expect(normalizarCodigo("fal!en@2024")).toBe("FALEN2024");
  });

  it("corta no tamanho máximo", () => {
    expect(normalizarCodigo("A".repeat(50))).toHaveLength(20);
  });

  it("código curto demais não vale", () => {
    expect(codigoValido("ab")).toBe(false);
    expect(codigoValido("gaules10")).toBe(true);
  });
});

describe("codigoSugerido", () => {
  it("usa o primeiro nome mais um sufixo, para dois xarás não colidirem", () => {
    expect(codigoSugerido("Mateus Nascimento Rodrigues", "7k")).toBe("MATEUS7K");
    expect(codigoSugerido("Lucas Silva", "a1b2")).toBe("LUCASA1B2");
  });

  it("nome que não sobra nada ainda devolve algo utilizável", () => {
    expect(codigoSugerido("!!!", "9z")).toBe("AFILIADO9Z");
  });
});

describe("emCentavos", () => {
  it("converte sem o erro do ponto flutuante", () => {
    expect(emCentavos(27.5)).toBe(2750);
    expect(emCentavos(0.1 + 0.2)).toBe(30);
    expect(emCentavos(19.99)).toBe(1999);
  });
});

describe("linkDeIndicacao", () => {
  it("monta o link sem barra dobrada", () => {
    expect(linkDeIndicacao("https://queotaskin.com/", "MATEUS7K")).toBe(
      "https://queotaskin.com/?ref=MATEUS7K",
    );
  });
});
