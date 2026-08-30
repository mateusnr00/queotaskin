import { describe, expect, it } from "vitest";

import {
  dataParaPtax,
  emSaoPaulo,
  inicioDaJanela,
  JANELA_EM_DIAS,
  lerInstanteDoBoletim,
  lerPeriodoPtax,
} from "@/lib/ptax";

const boletim = (
  dia: string,
  compra: number,
  venda: number,
  tipo = "Fechamento",
) => ({
  paridadeCompra: 7.11,
  paridadeVenda: 7.12,
  cotacaoCompra: compra,
  cotacaoVenda: venda,
  dataHoraCotacao: `${dia} 13:09:02.148`,
  tipoBoletim: tipo,
});

describe("dataParaPtax", () => {
  it("usa MM-DD-YYYY, e não o formato brasileiro", () => {
    // A troca silenciosa aqui é o erro mais provável desta integração: em
    // 08-09 as duas leituras existem e nenhuma quebra, só devolvem o dia errado.
    expect(dataParaPtax(new Date("2026-08-28T15:00:00Z"))).toBe("08-28-2026");
    expect(dataParaPtax(new Date("2026-03-09T15:00:00Z"))).toBe("03-09-2026");
  });

  it("o dia é o de São Paulo, e não o de UTC", () => {
    // 22h de Brasília é 01h UTC do dia seguinte. Em UTC isto pediria boletim
    // de um dia que ainda não aconteceu.
    expect(dataParaPtax(new Date("2026-08-29T01:00:00Z"))).toBe("08-28-2026");
    expect(emSaoPaulo(new Date("2026-08-29T01:00:00Z"))).toBe("2026-08-28");
  });
});

describe("inicioDaJanela", () => {
  it("recua a janela inteira, para atravessar feriado emendado", () => {
    const fim = new Date("2026-08-28T12:00:00Z");
    const ini = inicioDaJanela(fim);
    const dias = (fim.getTime() - ini.getTime()) / 86_400_000;
    expect(dias).toBe(JANELA_EM_DIAS);
  });
});

describe("lerInstanteDoBoletim", () => {
  it("lê como horário de Brasília, e não como UTC", () => {
    // Sem o offset, 13h de Brasília viraria 13h UTC e o dia escorregaria nas
    // pontas. 13:09 em -03:00 é 16:09Z.
    expect(lerInstanteDoBoletim("2026-08-28 13:09:02.148")?.toISOString()).toBe(
      "2026-08-28T16:09:02.000Z",
    );
  });

  it("texto fora do formato devolve nulo, e não data inválida", () => {
    for (const lixo of ["", "ontem", "28/08/2026", null, 42, undefined]) {
      expect(lerInstanteDoBoletim(lixo)).toBeNull();
    }
  });
});

describe("lerPeriodoPtax", () => {
  it("devolve o boletim mais recente do período", () => {
    const c = lerPeriodoPtax({
      value: [
        boletim("2026-08-26", 0.75, 0.7505),
        boletim("2026-08-28", 0.76, 0.7605),
        boletim("2026-08-27", 0.755, 0.7555),
      ],
    });
    expect(c?.cotacaoVenda).toBe(0.7605);
    expect(c?.dataDoBoletim.toISOString().slice(0, 10)).toBe("2026-08-28");
  });

  it("usa a taxa de VENDA, porque despesa converte pela venda", () => {
    const c = lerPeriodoPtax({ value: [boletim("2026-08-28", 0.76, 0.7605)] });
    expect(c?.taxa).toBe(0.7605);
    expect(c?.taxa).not.toBe(0.76);
  });

  it("ignora abertura e intermediário: o oficial do dia é o fechamento", () => {
    const c = lerPeriodoPtax({
      value: [
        boletim("2026-08-28", 0.76, 0.7605),
        boletim("2026-08-28", 0.99, 0.9999, "Abertura"),
        boletim("2026-08-28", 0.88, 0.8888, "Intermediário"),
      ],
    });
    expect(c?.cotacaoVenda).toBe(0.7605);
  });

  it("aceita boletim sem o campo de tipo", () => {
    const semTipo = {
      cotacaoCompra: 0.76,
      cotacaoVenda: 0.7605,
      dataHoraCotacao: "2026-08-28 13:09:02.148",
    };
    expect(lerPeriodoPtax({ value: [semTipo] })?.taxa).toBe(0.7605);
  });

  it("período vazio é resposta legítima, não erro: é fim de semana", () => {
    expect(lerPeriodoPtax({ value: [] })).toBeNull();
  });

  it("resposta de outro formato não derruba nada", () => {
    for (const lixo of [null, undefined, "", 42, [], {}, { value: "x" }]) {
      expect(lerPeriodoPtax(lixo)).toBeNull();
    }
  });

  it("recusa cotação vazia, zero, negativa ou fora de escala", () => {
    for (const v of [0, -1, 5000, null, "", "abc"]) {
      expect(
        lerPeriodoPtax({
          value: [
            {
              cotacaoCompra: 0.76,
              cotacaoVenda: v,
              dataHoraCotacao: "2026-08-28 13:09:02.148",
            },
          ],
        }),
      ).toBeNull();
    }
  });

  it("um boletim corrompido não leva o dia bom junto", () => {
    const c = lerPeriodoPtax({
      value: [
        { cotacaoCompra: null, cotacaoVenda: null, dataHoraCotacao: "x" },
        boletim("2026-08-27", 0.75, 0.7555),
      ],
    });
    expect(c?.taxa).toBe(0.7555);
  });
});
