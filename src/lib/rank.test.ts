import { describe, expect, it } from "vitest";

import { DEFAULT_XP_PER_BRL } from "./xp/config";
import { calculatePurchaseXp } from "./xp/regras";

import {
  MAX_LEVEL,
  PRESTIGE_RANKS,
  levelColor,
  levelFromXp,
  meetsMinLevel,
  nomeDoNivel,
  NOMES_DE_NIVEL,
  prestigeFromXp,
  rankDoPrestigio,
  rankFromXp,
  rankProgress,
  tierForLevel,
  xpForLevel,
  XP_POR_NIVEL,
} from "@/lib/rank";
import {
  CONTORNOS,
  DESIGN_POR_NIVEL,
  ARCO_IRIS_NIVEL_21,
  LADOS_DO_OCTOGONO,
  type FormaDoSelo,
} from "@/lib/rank-badges";

describe("xpForLevel / levelFromXp", () => {
  it("nível 0 não custa nada, todo mundo começa ranqueado", () => {
    expect(xpForLevel(0)).toBe(0);
    expect(levelFromXp(0)).toBe(0);
  });

  it("segue a tabela definida, em XP", () => {
    expect(xpForLevel(1)).toBe(1_000); // R$ 100
    expect(xpForLevel(5)).toBe(12_000); // R$ 1.200
    expect(xpForLevel(10)).toBe(47_000); // R$ 4.700
    expect(xpForLevel(21)).toBe(300_000); // R$ 30.000
  });

  it("a tabela cobre 0 a 21 e sempre sobe", () => {
    expect(XP_POR_NIVEL).toHaveLength(MAX_LEVEL + 1);
    for (let n = 1; n <= MAX_LEVEL; n++) {
      expect(XP_POR_NIVEL[n]!, `nível ${n}`).toBeGreaterThan(
        XP_POR_NIVEL[n - 1]!,
      );
    }
  });

  it("cada degrau custa mais que o anterior, a escada não afrouxa", () => {
    let anterior = XP_POR_NIVEL[1]! - XP_POR_NIVEL[0]!;
    for (let n = 2; n <= MAX_LEVEL; n++) {
      const degrau = XP_POR_NIVEL[n]! - XP_POR_NIVEL[n - 1]!;
      expect(degrau, `degrau até o nível ${n}`).toBeGreaterThanOrEqual(
        anterior,
      );
      anterior = degrau;
    }
  });

  it("é o inverso exato de xpForLevel em todos os níveis", () => {
    for (let level = 0; level <= MAX_LEVEL; level++) {
      expect(levelFromXp(xpForLevel(level))).toBe(level);
    }
  });

  it("não sobe de nível um XP antes do limiar", () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expect(levelFromXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it("trava no nível 21 por mais XP que entre", () => {
    expect(levelFromXp(1_000_000)).toBe(MAX_LEVEL);
  });

  it("ignora XP negativo", () => {
    expect(levelFromXp(-500)).toBe(0);
  });
});

describe("prestigeFromXp", () => {
  it("só entra em prestígio depois do topo dos níveis", () => {
    // O nível 21 custa 300 mil; a primeira patente vem depois disso.
    expect(prestigeFromXp(xpForLevel(MAX_LEVEL))).toBeNull();
    expect(prestigeFromXp(349_999)).toBeNull();
    expect(prestigeFromXp(350_000)?.key).toBe("MVP");
  });

  it("sobe pela escada de patentes na ordem certa", () => {
    expect(prestigeFromXp(350_000)?.key).toBe("MVP"); // R$ 35.000
    expect(prestigeFromXp(425_000)?.key).toBe("PRO_PLAYER"); // R$ 42.500
    expect(prestigeFromXp(499_999)?.key).toBe("PRO_PLAYER");
    expect(prestigeFromXp(500_000, 50_000)?.key).toBe("GOAT");
    expect(prestigeFromXp(9_000_000, 50_000)?.key).toBe("GOAT");
    // Sem o gasto, o mesmo XP para na patente anterior.
    expect(prestigeFromXp(9_000_000, 0)?.key).toBe("PRO_PLAYER");
  });

  it("as patentes estão em ordem crescente de XP", () => {
    for (let i = 1; i < PRESTIGE_RANKS.length; i++) {
      expect(PRESTIGE_RANKS[i].xp).toBeGreaterThan(PRESTIGE_RANKS[i - 1].xp);
    }
  });
});

describe("rankFromXp", () => {
  it("rotula o nível com o nome da patente, e não com o número", () => {
    const rank = rankFromXp(47_000); // R$ 4.700 = nível 10
    expect(rank.level).toBe(10);
    expect(rank.label).toBe("AK I");
    expect(rank.prestige).toBeNull();
  });

  it("todo nível da escada tem nome", () => {
    // Sem isto, um nível novo entraria com "undefined" no lugar do nome e só
    // apareceria na tela de alguém.
    for (let level = 0; level <= MAX_LEVEL; level++) {
      expect(nomeDoNivel(level), `nível ${level}`).toBeTruthy();
    }
    expect(NOMES_DE_NIVEL).toHaveLength(MAX_LEVEL + 1);
    // Fora da escada, não estoura: prende nas pontas.
    expect(nomeDoNivel(-3)).toBe("Recruta");
    expect(nomeDoNivel(99)).toBe("Lenda Global");
  });

  it("no prestígio, o rótulo vira a patente e o nível fica em 21", () => {
    const rank = rankFromXp(500_000, 50_000);
    expect(rank.label).toBe("GOAT");
    expect(rank.level).toBe(MAX_LEVEL);
    expect(rank.prestige?.key).toBe("GOAT");
  });

  it("mostra o nível nos selos comuns e o nome nas patentes", () => {
    // Um dígito nos níveis de 0 a 9, como nos desenhos entregues.
    expect(rankFromXp(47_000).numeral).toBe("10");
    expect(rankFromXp(0).numeral).toBe("0");
    // Patente não usa mais numeral romano: o selo traz o nome desenhado.
    expect(rankFromXp(500_000, 50_000).numeral).toBe("GOAT");
    expect(rankFromXp(350_000).numeral).toBe("MVP");
  });

  it("agrupa a escada com o vocabulário do competitivo brasileiro", () => {
    expect(rankFromXp(0).tierName).toBe("Recruta");
    expect(rankFromXp(xpForLevel(5)).tierName).toBe("Prata");
    expect(rankFromXp(xpForLevel(14)).tierName).toBe("Xerife");
    expect(rankFromXp(xpForLevel(21)).tierName).toBe("Global");
    // No prestígio, a faixa é a própria patente.
    expect(rankFromXp(500_000, 50_000).tierName).toBe("GOAT");
  });
});

describe("rankProgress", () => {
  it("aponta o próximo nível e quanto falta em reais", () => {
    // Nível 1 custa 1.000 XP (R$ 100); o nível 2 exige 2.500 (R$ 250).
    const p = rankProgress(1_750, 10);
    expect(p.rank.level).toBe(1);
    expect(p.nextLabel).toBe("Nível 2");
    expect(p.xpToNext).toBe(750);
    expect(p.brlToNext).toBe(75);
    expect(p.percent).toBe(50);
  });

  it("no nível 21 o próximo degrau é a primeira patente", () => {
    const p = rankProgress(xpForLevel(MAX_LEVEL), 10);
    expect(p.nextLabel).toBe("MVP");
    expect(p.atMax).toBe(false);
  });

  it("dentro do prestígio aponta a patente seguinte", () => {
    const p = rankProgress(350_000, 10); // MVP
    expect(p.rank.label).toBe("MVP");
    expect(p.nextLabel).toBe("PRO");
    expect(p.xpToNext).toBe(75_000); // 425.000 − 350.000
  });

  // rankProgress mede a ESCADA DE XP, e por isso não conhece a exigência de
  // gasto do GOAT: ela existe só no selo, que sai de rankFromXp com o gasto.
  // Separar os dois é o que permite a barra continuar dizendo "chegou ao topo
  // do XP" sem a página precisar revelar o requisito financeiro.
  it("no topo da escada de XP não há próximo degrau", () => {
    const p = rankProgress(500_000, 10);
    expect(p.atMax).toBe(true);
    expect(p.nextLabel).toBeNull();
    expect(p.percent).toBe(100);
    expect(p.xpToNext).toBe(0);
  });

  it("arredonda os reais que faltam pra cima, R$ 0,50 não sobe nível", () => {
    // Faltando 5 XP, meio real não basta: precisa gastar R$ 1.
    const p = rankProgress(xpForLevel(1) - 5, 10);
    expect(p.brlToNext).toBe(1);
  });

  it("converte o que falta usando o xpPerBrl do tenant", () => {
    // O nível 1 custa 1.000 XP. Na régua padrão são R$ 100; a 50 XP por
    // real, os mesmos 1.000 XP saem por R$ 20.
    const p = rankProgress(0, 50);
    expect(p.xpToNext).toBe(1_000);
    expect(p.brlToNext).toBe(20);
  });
});

describe("meetsMinLevel", () => {
  it("campanha sem exigência é aberta a todos", () => {
    expect(meetsMinLevel(0, null)).toBe(true);
    expect(meetsMinLevel(0, 0)).toBe(true);
  });

  it("barra quem está abaixo e libera a partir do nível exigido", () => {
    expect(meetsMinLevel(xpForLevel(9), 10)).toBe(false);
    expect(meetsMinLevel(xpForLevel(10), 10)).toBe(true);
    expect(meetsMinLevel(xpForLevel(15), 10)).toBe(true);
  });

  it("prestígio passa em qualquer exigência de nível", () => {
    expect(meetsMinLevel(300_000, 21)).toBe(true);
  });
});

describe("tierForLevel", () => {
  it("cobre todos os níveis sem buraco entre faixas", () => {
    for (let level = 0; level <= MAX_LEVEL; level++) {
      expect(tierForLevel(level).name).toBeTruthy();
    }
  });

  it("troca de grupo exatamente no nível de corte", () => {
    expect(tierForLevel(5).name).toBe("Prata");
    expect(tierForLevel(6).name).toBe("Ouro");
    expect(tierForLevel(13).name).toBe("AK");
    expect(tierForLevel(14).name).toBe("Xerife");
    expect(tierForLevel(17).name).toBe("Supremo");
    expect(tierForLevel(18).name).toBe("Global");
  });

  it("a cor de cada nível continua a mesma da escada antiga", () => {
    // A renomeação recortou os grupos, e a paleta NÃO podia andar junto: a
    // cor é do nível, não do grupo, e cada faixa abaixo é a de sempre.
    expect(levelColor(0)).toBe("#7d8894");
    expect(levelColor(3)).toBe("#5b8fc7");
    expect(levelColor(4)).toBe("#6d7fd6");
    expect(levelColor(8)).toBe("#9a72d1");
    expect(levelColor(12)).toBe("#c06ab8");
    expect(levelColor(16)).toBe("#d4694f");
    expect(levelColor(21)).toBe("#d8a53c");
  });
});

describe("desenho dos selos", () => {
  it("todo nível de 1 a 21 tem desenho", () => {
    for (let n = 1; n <= MAX_LEVEL; n++) {
      expect(DESIGN_POR_NIVEL[n], `nível ${n}`).toBeDefined();
    }
  });

  it("a silhueta sobe em quatro degraus, sem voltar atrás", () => {
    const ordem: FormaDoSelo[] = [
      "hexagono",
      "losango",
      "heptagono",
      "octogono",
    ];
    let anterior = 0;
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const atual = ordem.indexOf(DESIGN_POR_NIVEL[n]!.forma);
      expect(atual, `nível ${n}`).toBeGreaterThanOrEqual(anterior);
      anterior = atual;
    }
    // Começa no hexágono e termina no octógono.
    expect(DESIGN_POR_NIVEL[1]!.forma).toBe("hexagono");
    expect(DESIGN_POR_NIVEL[MAX_LEVEL]!.forma).toBe("octogono");
  });

  it("só o nível 21 usa arco-íris", () => {
    for (let n = 1; n < MAX_LEVEL; n++) {
      expect(DESIGN_POR_NIVEL[n]!.arcoIris, `nível ${n}`).toBeUndefined();
    }
    expect(DESIGN_POR_NIVEL[MAX_LEVEL]!.arcoIris).toBe(true);
  });

  it("cada cor é um hexadecimal válido", () => {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const d = DESIGN_POR_NIVEL[n]!;
      for (const cor of [...d.borda, ...d.miolo]) {
        expect(cor, `nível ${n}`).toMatch(hex);
      }
    }
  });

  it("o arco-íris fecha a volta: a última cor emenda na primeira", () => {
    expect(LADOS_DO_OCTOGONO).toHaveLength(8);
    expect(ARCO_IRIS_NIVEL_21).toHaveLength(LADOS_DO_OCTOGONO.length);
    const primeira = ARCO_IRIS_NIVEL_21[0]![0];
    const ultima = ARCO_IRIS_NIVEL_21.at(-1)!.at(-1);
    expect(ultima).toBe(primeira);
  });

  it("toda forma com polígono tem contorno externo e interno", () => {
    for (const forma of ["hexagono", "heptagono", "octogono"] as const) {
      expect(CONTORNOS[forma].externo.length).toBeGreaterThan(0);
      expect(CONTORNOS[forma].interno.length).toBeGreaterThan(0);
    }
  });
});

describe("rankDoPrestigio", () => {
  it("cada patente desenha o selo dela, e não o que os XP resolveriam", () => {
    // O bug que motivou esta função: a lista de patentes montava cada linha
    // com rankFromXp(prestigio.xp), e rankFromXp aplica a regra de gasto do
    // GOAT. Sem gasto informado, os 500 mil da linha do GOAT caíam para a
    // patente de baixo, e a tela mostrava o selo do PRO ao lado do nome GOAT.
    for (const prestigio of PRESTIGE_RANKS) {
      const r = rankDoPrestigio(prestigio);
      expect(r.prestige?.key).toBe(prestigio.key);
      expect(r.label).toBe(prestigio.label);
      expect(r.numeral).toBe(prestigio.label);
      expect(r.color).toBe(prestigio.color);
    }
  });

  it("o GOAT é o caso que quebrava, e agora sai GOAT", () => {
    const goat = PRESTIGE_RANKS.find((p) => p.key === "GOAT")!;
    expect(rankDoPrestigio(goat).prestige?.key).toBe("GOAT");
    // E a regra de gasto continua de pé onde ela importa, que é avaliar
    // alguém de verdade: só XP não faz ninguém GOAT.
    expect(rankFromXp(goat.xp).prestige?.key).not.toBe("GOAT");
  });
});

describe("a barra e o crédito usam a mesma régua", () => {
  // O DESENCONTRO QUE ISTO FECHA.
  //
  // A barra dizia "faltam R$ X" convertendo XP pela régua do painel, enquanto
  // o crédito convertia real em XP por uma constante fixa. Com as duas em 10
  // ninguém via; com o painel em 12, a barra prometia um valor que a compra
  // não cumpria. O que amarra as duas pontas é este ida-e-volta: o que a
  // barra pede em reais é exatamente o que uma compra desse tamanho credita.
  for (const regua of [10, 12, 25]) {
    it(`fecha o ida-e-volta com a régua em ${regua}`, () => {
      const xp = 400; // meio do caminho para o nível 1.
      const barra = rankProgress(xp, regua);

      // O que a barra pede em reais.
      expect(barra.brlToNext).toBe(Math.ceil(barra.xpToNext / regua));

      // Gastar exatamente isso, na mesma régua, cobre o que faltava.
      const gerado = calculatePurchaseXp({
        purchaseAmount: barra.brlToNext,
        activityMultiplier: 1,
        purchaseBonus: 0,
        luckBonus: 0,
        xpPerBrl: regua,
      });
      expect(gerado.baseXp).toBeGreaterThanOrEqual(barra.xpToNext);
      expect(rankProgress(xp + gerado.baseXp, regua).rank.level).toBe(1);
    });
  }

  it("régua estragada cai no mesmo padrão nos dois lados", () => {
    for (const ruim of [0, -1, 10.5, NaN]) {
      expect(rankProgress(400, ruim).brlToNext).toBe(
        rankProgress(400, 10).brlToNext,
      );
      expect(
        calculatePurchaseXp({
          purchaseAmount: 100,
          activityMultiplier: 1,
          purchaseBonus: 0,
          luckBonus: 0,
          xpPerBrl: ruim,
        }).baseXp,
      ).toBe(1_000);
    }
  });
});

describe("nenhuma conversão cai no padrão por esquecimento", () => {
  // A PONTA QUE ISTO FECHA.
  //
  // `rankProgress` tinha régua opcional com padrão 10, e `rank-card` chamava
  // sem passar nada: `brlToNext` saía na régua errada e ninguém via, porque
  // esquecer argumento opcional não gera erro. A régua virou obrigatória, e
  // estes casos travam o comportamento dela.
  it("cada régua produz o seu próprio valor em reais", () => {
    const xp = 0; // faltam 1.000 XP para o nível 1.
    expect(rankProgress(xp, 10).xpToNext).toBe(1_000);
    expect(rankProgress(xp, 10).brlToNext).toBe(100);
    expect(rankProgress(xp, 12).brlToNext).toBe(Math.ceil(1_000 / 12));
    expect(rankProgress(xp, 25).brlToNext).toBe(40);
  });

  it("o XP que falta não muda com a régua: só a conversão muda", () => {
    const faltando = rankProgress(500, 10).xpToNext;
    for (const regua of [10, 12, 25]) {
      expect(rankProgress(500, regua).xpToNext).toBe(faltando);
      expect(rankProgress(500, regua).percent).toBe(
        rankProgress(500, 10).percent,
      );
    }
  });

  it("o fallback continua existindo para régua inválida", () => {
    // Ele não sumiu: sumiu o ESQUECIMENTO. Régua estragada ainda cai em 10,
    // que é o que impede um banco tocado à mão de zerar a conversão.
    for (const ruim of [0, -1, 10.5, NaN, Infinity]) {
      expect(rankProgress(0, ruim).brlToNext).toBe(
        rankProgress(0, DEFAULT_XP_PER_BRL).brlToNext,
      );
    }
  });

  it("no topo não há conversão nenhuma a errar", () => {
    const p = rankProgress(500_000, 25);
    expect(p.atMax).toBe(true);
    expect(p.brlToNext).toBe(0);
  });
});
