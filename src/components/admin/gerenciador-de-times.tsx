"use client";

// A tela de times do painel: cadastrar, editar, enviar escudo, desativar,
// apagar.
//
// Uma lista com formulário embutido, e não uma página por time: são trinta
// linhas curtas, e navegar para uma tela só para trocar uma cor seria pior do
// que editar no lugar.
//
// A PRÉ-VISUALIZAÇÃO NÃO É ENFEITE
//
// O emblema aparece do lado do campo enquanto se digita, com a cor escolhida e
// a tag escolhida, porque é exatamente assim que ele vai sair ao lado do nome
// de quem torce. Sem isso, escolher cor é escolher no escuro e só descobrir o
// resultado no site público.

import { useRef, useState, useTransition } from "react";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import { Moldura } from "@/components/ui/moldura";
import { Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { semAcento } from "@/lib/busca";
import {
  contraste,
  textoSobreACor,
  type RegiaoDoTime,
  type TimeDeCS2,
} from "@/lib/times-cs2";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";
import {
  apagarTimeAction,
  enviarEscudoAction,
  removerEscudoAction,
  salvarEscudoUrlAction,
  salvarTimeAction,
} from "@/server/actions/times";

type TimeDoPainel = TimeDeCS2 & { ativo: boolean; ordem: number };

interface Rascunho {
  id: string | null;
  nome: string;
  tag: string;
  cor: string;
  regiao: RegiaoDoTime;
  ordem: number;
  ativo: boolean;
  /** URL do escudo. Colar o link evita baixar e subir de novo. */
  escudo: string;
}

const NOVO: Rascunho = {
  id: null,
  nome: "",
  tag: "",
  cor: "#ef4444",
  regiao: "BR",
  ordem: 0,
  ativo: true,
  escudo: "",
};

export function GerenciadorDeTimes({
  times,
  torcedores,
  storageLigado,
}: {
  times: TimeDoPainel[];
  torcedores: Record<string, number>;
  storageLigado: boolean;
}) {
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  // Busca. Com quarenta linhas, achar um time para editar virou rolagem, e a
  // pessoa já sabe o nome do que procura.
  const [busca, setBusca] = useState("");

  const alvo = semAcento(busca);
  const filtrados =
    alvo === ""
      ? times
      : times.filter(
          (t) =>
            semAcento(t.nome).includes(alvo) ||
            semAcento(t.tag).includes(alvo) ||
            semAcento(t.id).includes(alvo),
        );
  const br = filtrados.filter((t) => t.regiao === "BR");
  const inter = filtrados.filter((t) => t.regiao === "INTER");

  return (
    <div className="space-y-5">
      <CabecalhoDeAdmin
        etiqueta="Cadastro"
        icone={<Shield aria-hidden className="h-3 w-3" />}
        titulo="Times"
        descricao={`${times.length} cadastrados. O participante escolhe um em Minha Conta, e o emblema aparece ao lado do nome dele nas listas de ganhadores.`}
        migalha={[{ rotulo: "Admin", href: "/admin" }, { rotulo: "Times" }]}
        acoes={
          <Button type="button" onClick={() => setRascunho(NOVO)}>
            <Plus className="h-4 w-4" />
            Novo time
          </Button>
        }
      />

      {!storageLigado && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Storage não configurado: dá para cadastrar times, mas o envio de
          escudo fica indisponível até as variáveis do Supabase existirem.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, tag ou id"
          aria-label="Buscar time"
          className="h-9 w-full sm:max-w-xs"
        />
        {alvo !== "" && (
          <p className="text-xs text-muted-foreground">
            {filtrados.length} de {times.length}
          </p>
        )}
      </div>

      {rascunho && (
        <Formulario rascunho={rascunho} aoFechar={() => setRascunho(null)} />
      )}

      <Grupo
        titulo="Brasil"
        times={br}
        torcedores={torcedores}
        aoEditar={setRascunho}
        storageLigado={storageLigado}
      />
      <Grupo
        titulo="Internacionais"
        times={inter}
        torcedores={torcedores}
        aoEditar={setRascunho}
        storageLigado={storageLigado}
      />
    </div>
  );
}

function Grupo({
  titulo,
  times,
  torcedores,
  aoEditar,
  storageLigado,
}: {
  titulo: string;
  times: TimeDoPainel[];
  torcedores: Record<string, number>;
  aoEditar: (r: Rascunho) => void;
  storageLigado: boolean;
}) {
  if (times.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
        {titulo}
      </h2>
      <div className="grid gap-2">
        {times.map((t) => (
          <Linha
            key={t.id}
            time={t}
            torcedores={torcedores[t.id] ?? 0}
            aoEditar={aoEditar}
            storageLigado={storageLigado}
          />
        ))}
      </div>
    </section>
  );
}

function Linha({
  time,
  torcedores,
  aoEditar,
  storageLigado,
}: {
  time: TimeDoPainel;
  torcedores: number;
  aoEditar: (r: Rascunho) => void;
  storageLigado: boolean;
}) {
  const router = useRouter();
  const [ocupado, comTransicao] = useTransition();
  const arquivo = useRef<HTMLInputElement>(null);

  function enviarEscudo(file: File) {
    const fd = new FormData();
    fd.set("id", time.id);
    fd.set("arquivo", file);
    comTransicao(async () => {
      const r = await enviarEscudoAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Escudo enviado.");
      router.refresh();
    });
  }

  function apagar() {
    comTransicao(async () => {
      const r = await apagarTimeAction(time.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Time apagado.");
      router.refresh();
    });
  }

  return (
    <Moldura>
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 p-3 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.02]",
          !time.ativo && "opacity-60",
        )}
      >
        <EmblemaDoTime time={time} tamanho="lg" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {time.nome}
            {!time.ativo && (
              <span className="ml-2 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                Desativado
              </span>
            )}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {time.id} · {time.tag} · {time.cor}
            {torcedores > 0 && ` · ${torcedores} torcendo`}
          </p>
        </div>

        {/* O link do escudo, na própria linha.
          Colar trinta links abrindo o formulário trinta vezes seria absurdo:
          aqui é colar e sair do campo. Salva no blur e no Enter, e só quando o
          valor mudou, para passar o olho pela lista não gerar escrita. */}
        <CampoDeLink time={time} />

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <input
            ref={arquivo}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) enviarEscudo(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={ocupado || !storageLigado}
            title={storageLigado ? "Enviar escudo" : "Storage não configurado"}
            onClick={() => arquivo.current?.click()}
          >
            {time.escudo ? (
              <Upload className="h-4 w-4" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            <span className="sr-only">Enviar escudo</span>
          </Button>
          {time.escudo && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={ocupado}
              title="Remover escudo"
              onClick={() =>
                comTransicao(async () => {
                  const r = await removerEscudoAction(time.id);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success("Escudo removido.");
                  router.refresh();
                })
              }
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remover escudo</span>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={ocupado}
            onClick={() =>
              aoEditar({ ...time, id: time.id, escudo: time.escudo ?? "" })
            }
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Editar</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={ocupado}
            // Sem confirmação porque a ação já recusa quando há torcida, que é o
            // caso perigoso. Time sem torcedor não tem o que perder.
            title={
              torcedores > 0
                ? "Tem torcida: desative em vez de apagar"
                : "Apagar"
            }
            onClick={apagar}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Apagar</span>
          </Button>
        </div>
      </div>
    </Moldura>
  );
}

/**
 * O campo de link do escudo, direto na linha da lista.
 *
 * Salva ao sair do campo e no Enter, sem botão: um botão por linha em trinta
 * linhas é trinta alvos a mais para errar, e o gesto natural depois de colar
 * um link é sair do campo.
 */
function CampoDeLink({ time }: { time: TimeDoPainel }) {
  const router = useRouter();
  const [valor, setValor] = useState(time.escudo ?? "");
  const [salvando, comTransicao] = useTransition();
  // O que está no banco. Comparar com isto é o que evita salvar quando a
  // pessoa só clicou no campo e saiu.
  const gravado = time.escudo ?? "";

  function salvar() {
    if (valor.trim() === gravado) return;
    comTransicao(async () => {
      const r = await salvarEscudoUrlAction(time.id, valor);
      if (!r.ok) {
        toast.error(r.error);
        setValor(gravado);
        return;
      }
      toast.success(r.data.escudo ? "Escudo atualizado." : "Escudo removido.");
      router.refresh();
    });
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-72">
      <Input
        value={valor}
        disabled={salvando}
        maxLength={2048}
        onChange={(e) => setValor(e.target.value.trim())}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setValor(gravado);
        }}
        placeholder="https://... link do escudo"
        aria-label={`Link do escudo de ${time.nome}`}
        className={cn(
          "h-9 font-mono text-[11px]",
          salvando && "opacity-60",
          // Verde discreto quando já tem link: dá para varrer a lista e ver
          // quais faltam sem ler URL nenhuma.
          gravado && "border-emerald-500/40",
        )}
      />
    </div>
  );
}

function Formulario({
  rascunho,
  aoFechar,
}: {
  rascunho: Rascunho;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState(rascunho);
  const [salvando, comTransicao] = useTransition();

  function salvar() {
    comTransicao(async () => {
      const r = await salvarTimeAction(d);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(rascunho.id ? "Time atualizado." : "Time cadastrado.");
      aoFechar();
      router.refresh();
    });
  }

  // O emblema como ele vai sair, com o que está digitado agora.
  const previa: TimeDeCS2 = {
    id: d.id ?? "novo",
    nome: d.nome || "Time",
    tag: d.tag || "??",
    cor: /^#[0-9a-fA-F]{6}$/.test(d.cor) ? d.cor.toLowerCase() : "#ef4444",
    regiao: d.regiao,
    // A prévia mostra o link colado: é assim que dá para ver na hora se a
    // imagem existe e se ela fica legível no tamanho do emblema.
    escudo: d.escudo.startsWith("https://") ? d.escudo : null,
  };

  // O contraste entre a TAG e a cor escolhida.
  //
  // A tag é a identidade do time enquanto não houver escudo, e cor de meio de
  // escala deixa ela quase ilegível: nem o branco nem o preto salvam. Sem este
  // aviso, dá para cadastrar dez times seguidos com cores ruins e só descobrir
  // olhando o site, quando já são dez para corrigir.
  //
  // 4,5:1 é o piso da WCAG para texto pequeno, e a tag é pequena.
  const razao = contraste(previa.cor, textoSobreACor(previa.cor));
  const corFraca = razao < 4.5;

  return (
    <Moldura>
      <div className="p-4">
        <div className="mb-4 flex items-center gap-3">
          <EmblemaDoTime time={previa} tamanho="lg" />
          <div>
            <p className="text-sm font-bold">
              {rascunho.id ? "Editar time" : "Novo time"}
            </p>
            <p className="text-xs text-muted-foreground">
              {rascunho.id
                ? `id ${rascunho.id}, que não muda: é a chave gravada em quem torce.`
                : "O id sai do nome e não muda depois."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="time-nome">Nome</Label>
            <Input
              id="time-nome"
              value={d.nome}
              maxLength={40}
              onChange={(e) => setD({ ...d, nome: e.target.value })}
              placeholder="FURIA"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-tag">Tag (2 a 4 letras)</Label>
            <Input
              id="time-tag"
              value={d.tag}
              maxLength={4}
              onChange={(e) => setD({ ...d, tag: e.target.value })}
              placeholder="FUR"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-cor">Cor do emblema</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Escolher cor"
                value={/^#[0-9a-fA-F]{6}$/.test(d.cor) ? d.cor : "#ef4444"}
                onChange={(e) =>
                  setD({ ...d, cor: e.target.value.toLowerCase() })
                }
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent"
              />
              <Input
                id="time-cor"
                value={d.cor}
                maxLength={7}
                onChange={(e) =>
                  setD({ ...d, cor: e.target.value.toLowerCase() })
                }
                placeholder="#ef4444"
                className="font-mono"
              />
            </div>
            {corFraca && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                A tag fica difícil de ler nessa cor ({razao.toFixed(1)}:1, o
                mínimo é 4,5:1). Escureça ou clareie um pouco. Só afeta quem não
                tiver escudo.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-regiao">Região</Label>
            <select
              id="time-regiao"
              value={d.regiao}
              onChange={(e) =>
                setD({ ...d, regiao: e.target.value as RegiaoDoTime })
              }
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="BR">Brasil</option>
              <option value="INTER">Internacional</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-ordem">Ordem na lista</Label>
            <Input
              id="time-ordem"
              type="number"
              min={0}
              max={999}
              value={d.ordem}
              onChange={(e) => setD({ ...d, ordem: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <Switch
              id="time-ativo"
              checked={d.ativo}
              onCheckedChange={(v) => setD({ ...d, ativo: v })}
            />
            <Label htmlFor="time-ativo" className="cursor-pointer">
              Aparece no seletor
            </Label>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="time-escudo">Link do escudo (opcional)</Label>
          <Input
            id="time-escudo"
            value={d.escudo}
            maxLength={2048}
            onChange={(e) => setD({ ...d, escudo: e.target.value.trim() })}
            placeholder="https://img-cdn.hltv.org/teamlogo/..."
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Cole um link https e o escudo aparece na prévia aqui em cima. Sem
            link, o emblema desenha a tag sobre a cor. Também dá para enviar um
            arquivo pelo botão de imagem na linha do time.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={salvando}
            onClick={aoFechar}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </Moldura>
  );
}
