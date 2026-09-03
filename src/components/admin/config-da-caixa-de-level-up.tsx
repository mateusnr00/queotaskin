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

      <ul className="space-y-2">
        {drops.map((drop, i) => (
          <li
            key={drop.multiplier}
            className={cn(
              "rounded-xl border p-3 transition-opacity",
              drop.ativo
                ? "border-white/10 bg-white/[0.03]"
                : "border-white/[0.06] bg-transparent opacity-55",
            )}
          >
            <div className="flex items-center gap-3">
              {/* A INSÍGNIA DE VERDADE. É o que o cliente vê, e a cor é o que
                  se está escolhendo: preview falso aqui seria mentira. */}
              <XpBoostBadge
                multiplier={drop.multiplier}
                color={drop.color}
                size="sm"
                decorativo
                className="w-11 shrink-0 sm:w-12"
              />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold tabular-nums">
                  {drop.multiplier}x XP
                </p>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  {ROTULO_DA_RARIDADE[drop.rarity]}
                </p>
              </div>

              {/* No celular o interruptor sobe para a primeira fileira: é a
                  ação mais provável e a que precisa do polegar mais perto. */}
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  {drop.ativo ? "ativo" : "fora"}
                </span>
                <Switch
                  checked={drop.ativo}
                  onCheckedChange={(v) => mudar(i, "ativo", v)}
                  aria-label={`Ativar o multiplicador ${drop.multiplier}x`}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-4">
              <div className="min-w-0">
                <label
                  className="mb-1 block text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
                  htmlFor={`cor-${i}`}
                >
                  Cor
                </label>
                <div className="flex items-center gap-2">
                  {/* O seletor nativo, e não um de biblioteca: já é acessível,
                      já funciona no celular e não custa dependência nova. */}
                  <input
                    id={`cor-${i}`}
                    type="color"
                    value={corValida(drop.color) ? drop.color : "#A1A1AA"}
                    onChange={(e) => mudar(i, "color", e.target.value.toUpperCase())}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-white/15 bg-transparent p-0.5"
                    aria-label={`Cor do multiplicador ${drop.multiplier}x`}
                  />
                  <Input
                    value={drop.color}
                    onChange={(e) => mudar(i, "color", e.target.value.toUpperCase())}
                    className={cn(
                      "h-9 w-28 font-mono text-xs uppercase",
                      !corValida(drop.color) && "border-red-500/60",
                    )}
                    maxLength={7}
                    aria-label={`Código hexadecimal de ${drop.multiplier}x`}
                    aria-invalid={!corValida(drop.color)}
                  />
                </div>
                {!corValida(drop.color) && (
                  <p className="mt-1 text-[11px] text-red-400">
                    Use um hexadecimal, como #FF4655.
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <label
                  className="mb-1 block text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
                  htmlFor={`chance-${i}`}
                >
                  Chance
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id={`chance-${i}`}
                    value={chanceEmTexto[i] ?? bpsParaTexto(drop.probabilityBps)}
                    onChange={(e) => mudarChance(i, e.target.value)}
                    inputMode="decimal"
                    className="h-9 w-24 font-mono"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
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
