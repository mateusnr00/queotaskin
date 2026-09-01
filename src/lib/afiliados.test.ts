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
  progressaoDoIndicado,
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

describe("progressaoDoIndicado", () => {
  // A tabela da regra, em reais: a porcentagem é do GASTO ACUMULADO do
  // indicado, e sobe de degrau em degrau. Nada de arredondar para cima: quem
  // parou em R$ 199,99 está no mesmo degrau de quem parou em R$ 100.
  const pct = (reais: number) =>
    porcentagemDosBps(progressaoDoIndicado({ gastoEmCentavos: reais * 100 }).bps);

  it("R$ 0 a R$ 99,99 não rendem nada", () => {
    expect(pct(0)).toBe(0);
    expect(pct(50)).toBe(0);
    expect(pct(99.99)).toBe(0);
  });

  it("R$ 100 abrem o primeiro degrau: 2%", () => {
    expect(pct(100)).toBe(2);
  });

  it("R$ 199,99 continuam em 2%: o degrau não fecha antes da hora", () => {
    expect(pct(199.99)).toBe(2);
  });

  it("R$ 200 são 4%, R$ 250 continuam 4%, R$ 300 são 6%", () => {
    expect(pct(200)).toBe(4);
    expect(pct(250)).toBe(4);
    expect(pct(300)).toBe(6);
  });

  it("R$ 500 são 10%", () => {
    expect(pct(500)).toBe(10);
  });

  it("a escada é configurável: R$ 50 por degrau a 1,5% dão 4,5% em R$ 150", () => {
    const p = progressaoDoIndicado({
      gastoEmCentavos: 15_000,
      degrauEmCentavos: 5_000,
      bpsPorDegrau: 150,
    });
    expect(p.degraus).toBe(3);
    expect(p.bps).toBe(450);
    expect(porcentagemDosBps(p.bps)).toBe(4.5);
  });

  it("entrega os números da auditoria: R$ 347,50 são 3 degraus, 6%, faltam R$ 52,50", () => {
    expect(progressaoDoIndicado({ gastoEmCentavos: 34_750 })).toEqual({
      gastoEmCentavos: 34_750,
      degraus: 3,
      bps: 600,
      proximoDegrauEmCentavos: 40_000,
      faltaEmCentavos: 5_250,
    });
  });

  it("não passa de 100%, por mais que o indicado gaste", () => {
    expect(progressaoDoIndicado({ gastoEmCentavos: 100_000_00 }).bps).toBe(10_000);
  });

  it("gasto negativo (estorno maior que o pago) é tratado como zero", () => {
    expect(progressaoDoIndicado({ gastoEmCentavos: -500 }).bps).toBe(0);
  });

  it("recusa degrau zero em vez de dividir por ele", () => {
    expect(() =>
      progressaoDoIndicado({ gastoEmCentavos: 10_000, degrauEmCentavos: 0 }),
    ).toThrow();
  });
});

describe("conferirConfig", () => {
  it("aceita a configuração padrão", () => {
    expect(conferirConfig(CONFIG_PADRAO)).toBeNull();
  });

  it("recusa limiar zero", () => {
    expect(
      conferirConfig({
        ...CONFIG_PADRAO,
        limiarEmCentavos: 0,
        recompensaEmBps: 5000,
        valorDoCupomEmCentavos: 0,
      })?.campo,
    ).toBe("limiar");
  });

  it("recusa valores negativos", () => {
    expect(
      conferirConfig({
        ...CONFIG_PADRAO,
        limiarEmCentavos: -100,
        recompensaEmBps: 5000,
        valorDoCupomEmCentavos: 500,
      }),
    ).not.toBeNull();
    expect(
      conferirConfig({
        ...CONFIG_PADRAO,
        limiarEmCentavos: 1000,
        recompensaEmBps: -1,
        valorDoCupomEmCentavos: 500,
      }),
    ).not.toBeNull();
  });

  it("recusa cupom zerado", () => {
    expect(
      conferirConfig({
        ...CONFIG_PADRAO,
        limiarEmCentavos: 1000,
        recompensaEmBps: 1,
        valorDoCupomEmCentavos: 0,
      })?.campo,
    ).toBe("valor");
  });

  it("recusa recompensa acima de 100%", () => {
    expect(
      conferirConfig({
        ...CONFIG_PADRAO,
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
        ...CONFIG_PADRAO,
        limiarEmCentavos: 1000,
        recompensaEmBps: 5000,
        valorDoCupomEmCentavos: 700,
      })?.campo,
    ).toBe("valor");
  });
});

describe("conferirConfig no modo progressivo", () => {
  const progressivo = {
    ...CONFIG_PADRAO,
    modo: "PERCENTUAL_PROGRESSIVO" as const,
  };

  it("aceita a escada padrão", () => {
    expect(conferirConfig(progressivo)).toBeNull();
  });

  it("não exige que o valor do cupom bata com a porcentagem", () => {
    // No progressivo o valor sai na concessão, indicado por indicado, então
    // não existe um valor único para conferir contra a porcentagem.
    expect(
      conferirConfig({ ...progressivo, valorDoCupomEmCentavos: 700 }),
    ).toBeNull();
  });

  it("recusa degrau zero", () => {
    expect(conferirConfig({ ...progressivo, degrauEmCentavos: 0 })?.campo).toBe(
      "degrau",
    );
  });

  it("recusa aumento por degrau zerado ou acima de 100%", () => {
    expect(conferirConfig({ ...progressivo, bpsPorDegrau: 0 })?.campo).toBe(
      "bpsPorDegrau",
    );
    expect(conferirConfig({ ...progressivo, bpsPorDegrau: 12_000 })?.campo).toBe(
      "bpsPorDegrau",
    );
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
