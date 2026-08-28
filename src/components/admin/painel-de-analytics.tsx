"use client";

// Os rastreadores da campanha, um card por provedor.
//
// Antes era um campo solto para o pixel da Meta. Com três ferramentas, uma
// lista de campos empilhados obriga a ler todos para descobrir qual está
// ligado, e é justamente essa a pergunta que se faz ao abrir esta tela.
//
// Cada card diz o seu estado por conta própria: ligado ou desligado, no
// cabeçalho, antes de qualquer campo. A leitura de relance é a de status, e o
// campo fica logo abaixo para quem veio mudar alguma coisa.
//
// A VALIDAÇÃO É O PONTO
//
// O campo se chama "ID" e, sem conferência, aceita o bloco inteiro que o
// Google e o TikTok entregam, com <script src=...> e tudo. Ele salva, e o
// rastreamento simplesmente não funciona, sem aviso nenhum. Aqui o formato de
// cada provedor é conhecido: colar o bloco é detectado, o id é extraído de
// dentro dele e oferecido com um clique.

import { useState, useTransition } from "react";
import {
  AlertCircle,
  BarChart3,
  Check,
  Music2,
  ThumbsUp,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { updateAnalyticsAction } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  conferirId,
  exemploDoId,
  extrairId,
  pareceScript,
  type Provedor,
} from "@/lib/analytics-ids";
import { cn } from "@/lib/utils";

export interface IdsDeAnalytics {
  metaPixelId: string;
  googleAnalyticsId: string;
  tiktokPixelId: string;
}

const PROVEDORES: {
  chave: keyof IdsDeAnalytics;
  provedor: Provedor;
  nome: string;
  icone: typeof ThumbsUp;
  oQueFaz: string;
  ondeAchar: string;
}[] = [
  {
    chave: "metaPixelId",
    provedor: "meta",
    nome: "Meta (Facebook e Instagram)",
    icone: ThumbsUp,
    oQueFaz:
      "Avisa a Meta quando alguém abre a campanha, começa uma reserva e conclui o pagamento. É com esses três avisos que ela otimiza a entrega do anúncio.",
    ondeAchar: "Gerenciador de Eventos, em Fontes de dados.",
  },
  {
    chave: "googleAnalyticsId",
    provedor: "ga4",
    nome: "Google Analytics 4",
    icone: BarChart3,
    oQueFaz:
      "Mede as visitas e o caminho que a pessoa faz dentro do site, inclusive quando ela troca de página sem recarregar.",
    ondeAchar: "Administrador, em Fluxos de dados.",
  },
  {
    chave: "tiktokPixelId",
    provedor: "tiktok",
    nome: "TikTok Ads",
    icone: Music2,
    oQueFaz:
      "Mesmo papel do pixel da Meta, do lado do TikTok: mede o que o anúncio traz e alimenta a otimização da entrega.",
    ondeAchar: "TikTok Ads Manager, em Assets e Events.",
  },
];

export function PainelDeAnalytics({ inicial }: { inicial: IdsDeAnalytics }) {
  const [ids, setIds] = useState<IdsDeAnalytics>(inicial);
  const [erros, setErros] = useState<Partial<Record<keyof IdsDeAnalytics, string>>>({});
  const [isPending, startTransition] = useTransition();

  function salvar() {
    // Confere tudo antes de mandar: salvar um id inválido deixa a ferramenta
    // desligada sem ninguém saber, que é o pior desfecho possível aqui.
    const novosErros: Partial<Record<keyof IdsDeAnalytics, string>> = {};
    const limpos = { ...ids };
    for (const p of PROVEDORES) {
      const r = conferirId(ids[p.chave], p.provedor);
      if (!r.ok) novosErros[p.chave] = r.erro;
      else limpos[p.chave] = r.valor;
    }
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      toast.error("Confira os identificadores destacados.");
      return;
    }

    startTransition(async () => {
      try {
        const r = await updateAnalyticsAction(limpos);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setIds(limpos);
        toast.success("Rastreamento atualizado");
      } catch {
        // Server Action lança quando a rede cai, e o `if (!ok)` nunca rodaria.
        toast.error("Não foi possível salvar. Tente de novo.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {PROVEDORES.map((p) => {
        const valor = ids[p.chave];
        const erro = erros[p.chave];
        const ligado = valor.trim() !== "" && !erro;
        const colouScript = pareceScript(valor);
        const idDeDentro = colouScript ? extrairId(valor, p.provedor) : null;

        const Icone = p.icone;

        return (
          <Card
            key={p.chave}
            className={cn(
              // A faixa lateral é o sinal de longe: numa pilha de cards
              // iguais, o que está ligado precisa se separar antes da leitura.
              "border-l-4 p-5 transition-colors",
              ligado ? "border-l-emerald-500" : "border-l-transparent",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
                  ligado
                    ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/25"
                    : "bg-muted/50 text-muted-foreground ring-border",
                )}
              >
                <Icone className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">{p.nome}</h3>
                  {/* O estado no cabeçalho, e não deduzido do campo: a
                      pergunta de quem abre esta tela é "o que está ligado". */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      ligado
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {ligado && <Check aria-hidden className="h-3 w-3" />}
                    {ligado ? "Ativo" : "Desligado"}
                  </span>
                </div>

                {/* Medida limitada: a linha inteira do card passa de 130
                    caracteres, e o olho perde a volta entre uma linha e outra. */}
                <p className="mt-1 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
                  {p.oQueFaz}
                </p>

                <div className="mt-4 max-w-md space-y-1.5">
                  <Label
                    htmlFor={p.chave}
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Identificador
                  </Label>
                  <Input
                    id={p.chave}
                    value={valor}
                    onChange={(e) => {
                      setIds((v) => ({ ...v, [p.chave]: e.target.value }));
                      if (erro) setErros((v) => ({ ...v, [p.chave]: undefined }));
                    }}
                    placeholder={exemploDoId(p.provedor)}
                    className="h-11 font-mono text-sm"
                    aria-invalid={Boolean(erro)}
                    aria-describedby={`${p.chave}-ajuda`}
                  />

                  {/* O conserto de um clique. Quem colou o bloco tem o id ali
                      dentro, e mandar voltar ao Google para procurar de novo é
                      trabalho que este campo pode poupar. */}
                  {idDeDentro && (
                    <button
                      type="button"
                      onClick={() => {
                        setIds((v) => ({ ...v, [p.chave]: idDeDentro }));
                        setErros((v) => ({ ...v, [p.chave]: undefined }));
                      }}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                    >
                      <Wand2 aria-hidden className="h-3.5 w-3.5" />
                      Usar {idDeDentro}
                    </button>
                  )}

                  {erro && (
                    <p
                      role="alert"
                      className="flex items-start gap-1.5 text-xs font-medium text-destructive"
                    >
                      <AlertCircle
                        aria-hidden
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      />
                      {erro}
                    </p>
                  )}

                  <p
                    id={`${p.chave}-ajuda`}
                    className="text-[11px] leading-relaxed text-muted-foreground"
                  >
                    {p.ondeAchar} Cole só o identificador, não o bloco de
                    instalação.{" "}
                    <span className="font-medium text-foreground">
                      Vazio desliga
                    </span>
                    : sem id, nenhum script dessa ferramenta entra no site.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={isPending} className="min-h-11">
          {isPending ? "Salvando..." : "Salvar rastreamento"}
        </Button>
      </div>
    </div>
  );
}
