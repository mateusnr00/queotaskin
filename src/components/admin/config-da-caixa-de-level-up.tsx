"use client";

// A configuração da Caixa de Level Up, no painel.
//
// O DESENHO SEGUE O PAINEL, NÃO INVENTA UM DIALETO.
//
// Moldura, seção, switch, input e botão são os mesmos do resto do admin. O que
// há de novo aqui é uma linha por resultado, e ela foi resolvida como LISTA DE
// LINHAS e não como tabela: tabela obriga o celular a rolar de lado ou a
// espremer seis colunas em 360px, e editar cor num campo de 40px é o tipo de
// coisa que faz alguém desistir e deixar a paleta como veio.
//
// No desktop a linha é horizontal, na ordem em que se lê a decisão: a
// insígnia (o que o cliente vê), o multiplicador, a cor, a chance e o
// interruptor. No celular ela vira duas fileiras dentro do mesmo cartão, com
// a insígnia à esquerda servindo de âncora visual.
//
// O PREVIEW É O COMPONENTE DE VERDADE.
//
// `XpBoostBadge`, o mesmo que a roleta e a revelação usam. Uma imitação aqui
// mostraria uma coisa e entregaria outra, e a cor é justamente o que se está
// escolhendo.
//
// A SOMA NÃO É SÓ UMA COR.
//
// Vermelho e verde sozinhos não informam quem não distingue os dois, então o
// estado sempre vem com texto e ícone: "100%" com um confere, ou "97%" com o
// que falta escrito ao lado.

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, Gift, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SecaoDoFormulario } from "@/components/admin/secao-de-formulario";
import { XpBoostBadge } from "@/components/public/xp-boost-badge";
import {
  bpsParaPorcento,
  corValida,
  porcentoParaBps,
  ROTULO_DA_RARIDADE,
  somaDasChances,
  TOTAL_EM_BPS,
} from "@/lib/xp/caixa-de-level-up";
import {
  restaurarDropsPadraoAction,
  salvarConfigDaCaixaAction,
} from "@/server/actions/caixa-de-level-up-admin";
import { cn } from "@/lib/utils";

type Raridade = keyof typeof ROTULO_DA_RARIDADE;

export interface DropNaTela {
  multiplier: number;
  rarity: Raridade;
  probabilityBps: number;
  color: string;
  ativo: boolean;
}

/** O texto do campo de chance: 3000 vira "30", 125 vira "1,25". */
function bpsParaTexto(bps: number): string {
  return String(bpsParaPorcento(bps)).replace(".", ",");
}

export function ConfigDaCaixaDeLevelUp({
  ligadoInicial,
  minutosInicial,
  dropsIniciais,
}: {
  ligadoInicial: boolean;
  minutosInicial: number;
  dropsIniciais: DropNaTela[];
}) {
  const [ligado, setLigado] = useState(ligadoInicial);
  const [minutos, setMinutos] = useState(String(minutosInicial));
  const [drops, setDrops] = useState(dropsIniciais);
  // O texto digitado fica à parte do número: enquanto alguém escreve "1,2"
  // para chegar em "1,25", o campo não pode reescrever o que ele digitou.
  const [chanceEmTexto, setChanceEmTexto] = useState<Record<number, string>>(
    () => Object.fromEntries(dropsIniciais.map((d, i) => [i, bpsParaTexto(d.probabilityBps)])),
  );
  const [salvando, iniciar] = useTransition();

  const soma = useMemo(
    () => somaDasChances(drops.filter((d) => d.ativo)),
    [drops],
  );
  const fecha = soma === TOTAL_EM_BPS;
  // A régua da barra de proporção: a maior chance ativa vira largura cheia.
  const maiorChance = useMemo(
    () => Math.max(1, ...drops.filter((d) => d.ativo).map((d) => d.probabilityBps)),
    [drops],
  );
  const coresOk = drops.every((d) => corValida(d.color));
  const podeSalvar = fecha && coresOk;

  function mudar(i: number, campo: keyof DropNaTela, valor: unknown) {
    setDrops((antes) => antes.map((d, j) => (j === i ? { ...d, [campo]: valor } : d)));
  }

  function mudarChance(i: number, texto: string) {
    // Aceita vírgula e ponto: teclado brasileiro produz vírgula, e teclado
    // numérico de celular produz ponto.
    const limpo = texto.replace(/[^\d.,]/g, "");
    setChanceEmTexto((antes) => ({ ...antes, [i]: limpo }));
    const numero = Number(limpo.replace(",", "."));
    if (Number.isFinite(numero)) mudar(i, "probabilityBps", porcentoParaBps(numero));
  }

  function salvar() {
    iniciar(async () => {
      const r = await salvarConfigDaCaixaAction({
        ligado,
        minutos: Number(minutos),
        drops,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Configuração salva");
    });
  }

  function restaurar() {
    iniciar(async () => {
      const r = await restaurarDropsPadraoAction();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Tabela de fábrica restaurada. Recarregue para ver.");
    });
  }

  return (
    <SecaoDoFormulario
      titulo="Boosts de Level"
      descricao="Cada nível conquistado rende uma caixa fechada. Abrir sorteia um destes multiplicadores, que vale na próxima compra confirmada."
      icone={<Gift className="h-4 w-4" />}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Conceder caixas</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Desligado, nenhuma caixa nova é concedida. As já concedidas
            continuam abríveis: tirar da mão de quem ganhou seria quebrar
            promessa feita.
          </p>
        </div>
        <Switch
          checked={ligado}
          onCheckedChange={setLigado}
          aria-label="Conceder caixas de level up"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold" htmlFor="minutos-do-boost">
          Duração do boost depois de aberto
        </label>
        <Input
          id="minutos-do-boost"
          value={minutos}
          onChange={(e) => setMinutos(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          className="h-9 w-20 font-mono"
        />
        <span className="text-xs text-muted-foreground">minutos</span>
      </div>

      {/* O CABEÇALHO DA SOMA. Fica ACIMA da lista, não escondido no fim: é o
          número que decide se dá para salvar, e quem está mexendo nas chances
          precisa vê-lo mudar sem rolar a página. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
        <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          Resultados possíveis
        </p>
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs font-bold tabular-nums",
            fecha ? "text-emerald-400" : "text-amber-400",
          )}
        >
          {fecha ? (
            <Check aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
          )}
          {bpsParaPorcento(soma).toLocaleString("pt-BR")}%
          {!fecha && (
            <span className="font-normal text-muted-foreground">
              {soma < TOTAL_EM_BPS
                ? `faltam ${bpsParaPorcento(TOTAL_EM_BPS - soma).toLocaleString("pt-BR")}%`
                : `sobram ${bpsParaPorcento(soma - TOTAL_EM_BPS).toLocaleString("pt-BR")}%`}
            </span>
          )}
        </p>
      </div>

      {/* UMA LINHA POR RESULTADO.
          Cada drop ocupava um cartão inteiro, com os controles numa segunda
          área embaixo: nove resultados viravam uma página de rolagem e era
          impossível comparar as chances entre si, que é justamente o que se
          faz ao ajustar economia. Agora cabe tudo numa linha no desktop, e
          quebra em duas no celular sem virar tabela rolando de lado.

          O badge NÃO é repetido em texto ao lado. Ele já diz "1.5x XP"; o que
          o texto acrescenta é a raridade, e só. */}
      <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
        {drops.map((drop, i) => (
          <li
            key={drop.multiplier}
            className={cn(
              // Um respiro só entre todas as colunas, e altura mínima fixa:
              // com gaps diferentes por grupo, raridade, cor, chance, barra e
              // interruptor liam como blocos separados em vez de uma linha.
              "flex min-h-[3.25rem] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-1.5 transition-colors sm:flex-nowrap",
              drop.ativo ? "bg-white/[0.02]" : "bg-transparent opacity-50",
            )}
          >
            <XpBoostBadge
              multiplier={drop.multiplier}
              color={drop.color}
              size="sm"
              decorativo
              className="w-10 shrink-0"
            />

            {/* Uma identificação compacta, não a repetição do badge. Ele já
                desenha o multiplicador; o que falta para percorrer a lista de
                olho é o número em texto alinhado e a raridade. */}
            <span className="w-9 shrink-0 font-mono text-xs font-bold tabular-nums">
              {drop.multiplier}x
            </span>
            <span className="w-[4.75rem] shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {ROTULO_DA_RARIDADE[drop.rarity]}
            </span>

            <div className="flex shrink-0 items-center gap-1.5">
              <input
                type="color"
                value={corValida(drop.color) ? drop.color : "#A1A1AA"}
                onChange={(e) => mudar(i, "color", e.target.value.toUpperCase())}
                className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-white/15 bg-transparent p-0.5"
                aria-label={`Cor do multiplicador ${drop.multiplier}x`}
              />
              <Input
                value={drop.color}
                onChange={(e) => mudar(i, "color", e.target.value.toUpperCase())}
                className={cn(
                  "h-7 w-[5.5rem] px-2 font-mono text-[11px] uppercase",
                  !corValida(drop.color) && "border-red-500/60",
                )}
                maxLength={7}
                aria-label={`Código hexadecimal de ${drop.multiplier}x`}
                aria-invalid={!corValida(drop.color)}
              />
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Input
                id={`chance-${i}`}
                value={chanceEmTexto[i] ?? bpsParaTexto(drop.probabilityBps)}
                onChange={(e) => mudarChance(i, e.target.value)}
                inputMode="decimal"
                className="h-7 w-16 px-2 text-right font-mono text-[11px]"
                aria-label={`Chance de ${drop.multiplier}x em porcento`}
              />
              <span className="text-[11px] text-muted-foreground">%</span>
            </div>

            {/* A BARRA DE PROPORÇÃO OCUPA O VÃO COM INFORMAÇÃO.
                Sobrava meia linha vazia entre a chance e o interruptor. Em
                vez de espaço morto, a fatia de cada resultado em relação ao
                maior: é o que se está de fato ajustando, e ler nove números
                soltos não diz se a curva está íngreme ou achatada.

                Some no celular, onde a largura é do controle. */}
            <div className="hidden min-w-0 flex-1 items-center sm:flex">
              <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${maiorChance > 0 ? (drop.probabilityBps / maiorChance) * 100 : 0}%`,
                    backgroundColor: drop.ativo
                      ? `color-mix(in srgb, ${corValida(drop.color) ? drop.color : "#A1A1AA"} 70%, transparent)`
                      : "rgba(255,255,255,0.12)",
                  }}
                />
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
              {!corValida(drop.color) && (
                <span className="text-[10px] text-red-400">HEX inválido</span>
              )}
              <Switch
                checked={drop.ativo}
                onCheckedChange={(v) => mudar(i, "ativo", v)}
                aria-label={`Ativar o multiplicador ${drop.multiplier}x`}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Só as linhas ativas entram no sorteio e na soma. Aceita casa decimal:
        0,5% e 1,25% funcionam. Uma tabela que não fecha em 100% deixaria uma
        faixa do sorteio sem dono, então ela não é salva, nem aqui nem no
        servidor.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={salvando || !podeSalvar} onClick={salvar}>
          {salvando ? "Salvando..." : "Salvar configuração"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={salvando}
          onClick={restaurar}
        >
          <RotateCcw aria-hidden className="mr-1.5 h-3.5 w-3.5" />
          Tabela de fábrica
        </Button>
      </div>
    </SecaoDoFormulario>
  );
}
