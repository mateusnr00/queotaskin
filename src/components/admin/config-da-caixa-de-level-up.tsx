"use client";

// A configuração da Caixa de Level Up, no painel.
//
// A SOMA APARECE ENQUANTO SE DIGITA.
//
// A regra é que os multiplicadores ativos somem 100%, e o servidor recusa o
// que não fecha. Mostrar a soma só na hora de salvar transformaria a
// conferência em tentativa e erro; mostrando ao lado, quem está mexendo vê o
// número subir e desce sozinho para o lugar.
//
// O botão de salvar fica desligado enquanto não fecha, mas o servidor confere
// de novo: tela não é validação, é conveniência.

import { useState, useTransition } from "react";
import { Gift, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SecaoDoFormulario } from "@/components/admin/secao-de-formulario";
import { ROTULO_DA_RARIDADE, somaDasChances } from "@/lib/xp/caixa-de-level-up";
import {
  restaurarDropsPadraoAction,
  salvarConfigDaCaixaAction,
} from "@/server/actions/caixa-de-level-up-admin";
import { cn } from "@/lib/utils";

type Raridade = keyof typeof ROTULO_DA_RARIDADE;

export interface DropNaTela {
  multiplier: number;
  rarity: Raridade;
  chance: number;
  ativo: boolean;
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
  const [salvando, iniciar] = useTransition();

  const ativos = drops.filter((d) => d.ativo);
  const soma = somaDasChances(ativos);
  const fecha = soma === 100 && ativos.length > 0;

  function mudar(i: number, campo: keyof DropNaTela, valor: unknown) {
    setDrops((antes) =>
      antes.map((d, j) => (j === i ? { ...d, [campo]: valor } : d)),
    );
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
      titulo="Caixa de Level Up"
      descricao="Cada nível conquistado rende uma caixa fechada. Abrir sorteia um multiplicador de XP que vale na próxima compra confirmada."
      icone={<Gift className="h-4 w-4" />}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Conceder caixas</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Desligado, nenhuma caixa nova é concedida. As já concedidas
            continuam abríveis: tirar da mão de quem ganhou seria quebrar
            promessa feita.
          </p>
        </div>
        <Switch checked={ligado} onCheckedChange={setLigado} />
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

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            Multiplicadores e chances
          </p>
          <p
            className={cn(
              "text-xs font-bold tabular-nums",
              fecha ? "text-emerald-400" : "text-red-400",
            )}
          >
            {soma}% {fecha ? "" : "(precisa ser 100%)"}
          </p>
        </div>

        <ul className="space-y-1.5">
          {drops.map((drop, i) => (
            <li
              key={drop.multiplier}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
                drop.ativo
                  ? "border-white/10 bg-white/[0.03]"
                  : "border-white/5 bg-transparent opacity-50",
              )}
            >
              <span className="w-14 font-mono text-sm font-bold tabular-nums">
                {drop.multiplier}x
              </span>
              <span className="w-24 text-[11px] tracking-wide text-muted-foreground uppercase">
                {ROTULO_DA_RARIDADE[drop.rarity]}
              </span>
              <Input
                value={String(drop.chance)}
                onChange={(e) =>
                  mudar(i, "chance", Number(e.target.value.replace(/\D/g, "")) || 0)
                }
                inputMode="numeric"
                className="h-8 w-16 font-mono"
                aria-label={`Chance de ${drop.multiplier}x`}
              />
              <span className="text-xs text-muted-foreground">%</span>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">ativo</span>
                <Switch
                  checked={drop.ativo}
                  onCheckedChange={(v) => mudar(i, "ativo", v)}
                />
              </div>
            </li>
          ))}
        </ul>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Só as linhas ativas entram no sorteio e na soma. Uma tabela que não
          fecha em 100% deixaria uma faixa sem dono, então ela não é salva.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={salvando || !fecha} onClick={salvar}>
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
