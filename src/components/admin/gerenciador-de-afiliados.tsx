"use client";

// A gestão do programa de afiliados, no painel.
//
// Uma tela, três coisas: achar gente, ativar quem vai divulgar, e mexer no
// que já está rodando (suspender, trocar código, ajustar entradas). A busca
// serve aos dois lados: filtra a lista de afiliados e, ao mesmo tempo,
// oferece as contas que ainda não são afiliadas com o mesmo nome.
//
// CADA AFILIADO É UMA LINHA QUE ABRE
//
// Antes, todo cartão vinha aberto: nome, código, cinco placas de número, o
// painel de recompensa e o de ajuste, tudo de uma vez. Com dois afiliados
// passava; com trinta, a tela vira um paredão e achar alguém exige rolar por
// tudo o que não interessa. Agora a linha fechada mostra o que se procura
// (nome, situação, código, indicados e entradas disponíveis) e o resto abre
// no clique. Mexer em afiliado é raro; olhar a lista é o que se faz sempre, e
// quem manda no desenho é o caso frequente.
//
// A ABERTURA É UMA SÓ
//
// Abrir um fecha o outro. Dois painéis de ajuste abertos ao mesmo tempo é
// como se digita o motivo no cartão errado, e ajuste de entrada mexe em
// dinheiro.
//
// O TOPO RESPONDE ANTES DE ROLAR
//
// As placas de resumo saem de agregação do programa inteiro, não da página
// listada: somar o que está na tela daria um total que muda com a busca.
//
// O ajuste manual exige motivo. Não é burocracia: entrada vale uma cota em
// qualquer campanha, e um saldo que muda sem explicação é a coisa que
// ninguém consegue reconstruir três meses depois.

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Link2,
  Minus,
  Percent,
  Plus,
  Search,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import {
  ajustarEntradasAction,
  alterarCodigoDoAfiliadoAction,
  ativarAfiliadoAction,
  definirConfigDeRecompensaAction,
  definirStatusDoAfiliadoAction,
} from "@/server/actions/afiliados";
import {
  bpsDaPorcentagem,
  bpsDoValorDoCupom,
  conferirConfig,
  normalizarCodigo,
  porcentagemDosBps,
  progressaoDoIndicado,
  valorDoCupom,
  CONFIG_PADRAO,
  type ModoDeRecompensa,
} from "@/lib/afiliados";
import { formatBRL } from "@/lib/format";
import { formatPhone } from "@/lib/cpf";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Moldura, Placa } from "@/components/ui/moldura";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface AfiliadoNaLista {
  id: string;
  userId: string;
  nome: string;
  telefone: string | null;
  codigo: string;
  status: "INACTIVE" | "ACTIVE" | "SUSPENDED";
  indicados: number;
  disponiveis: number;
  reservadas: number;
  usadas: number;
  /** Progresso rumo ao próximo cupom. Negativo é dívida de estorno. */
  progressoEmCentavos: number;
  usaConfigPropria: boolean;
  config: {
    modo: ModoDeRecompensa;
    limiarEmCentavos: number;
    recompensaEmBps: number;
    valorDoCupomEmCentavos: number;
    degrauEmCentavos: number;
    bpsPorDegrau: number;
  };
  desde: string;
}

const FOCO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const ROTULO_DO_STATUS: Record<AfiliadoNaLista["status"], string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  INACTIVE: "Inativo",
};

export interface ResumoDoPrograma {
  total: number;
  ativos: number;
  suspensos: number;
  indicados: number;
  disponiveis: number;
  reservadas: number;
  usadas: number;
}

export function GerenciadorDeAfiliados({
  afiliados,
  candidatos,
  busca,
  total,
  porPagina,
  resumo,
}: {
  afiliados: AfiliadoNaLista[];
  candidatos: { id: string; name: string; phone: string | null }[];
  busca: string;
  /** Quantos afiliados existem no total, para o aviso de lista cortada. */
  total: number;
  porPagina: number;
  resumo: ResumoDoPrograma;
  /** Só para deixar claro de qual tenant é a tela; a action confere de novo. */
  tenantId?: string;
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [termo, setTermo] = useState(busca);
  const [isPending, startTransition] = useTransition();
  // Um aberto por vez. Dois painéis de ajuste abertos é como se digita o
  // motivo no cartão errado.
  const [aberto, setAberto] = useState<string | null>(null);

  function buscar() {
    const url = new URLSearchParams(parametros.toString());
    if (termo.trim()) url.set("q", termo.trim());
    else url.delete("q");
    router.push(`/admin/afiliados?${url.toString()}`);
  }

  function ativar(userId: string) {
    startTransition(async () => {
      const r = await ativarAfiliadoAction({ userId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Afiliado ativado com o código ${r.data.codigo}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* O RESUMO VEM ANTES DA LISTA.
          "Quantos afiliados eu tenho e quantas entradas estão soltas por aí"
          é a pergunta que se faz ao abrir a tela, e antes dela a resposta
          exigia somar cinco cartões de cabeça. Entradas disponíveis ganha
          destaque porque é a única que custa dinheiro: cada uma vale uma cota
          em qualquer campanha. */}
      {resumo.total > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Placa
            rotulo="Afiliados"
            valor={String(resumo.total)}
            nota={
              resumo.suspensos > 0
                ? `${resumo.ativos} ativos, ${resumo.suspensos} suspensos`
                : `${resumo.ativos} ativos`
            }
            icone={<Link2 aria-hidden className="h-3 w-3" />}
          />
          <Placa
            rotulo="Indicados"
            valor={String(resumo.indicados)}
            nota="contas que chegaram por um link"
            icone={<Users aria-hidden className="h-3 w-3" />}
            tom="marca"
          />
          <Placa
            rotulo="Entradas disponíveis"
            valor={String(resumo.disponiveis)}
            nota="cada uma vale uma cota"
            icone={<Ticket aria-hidden className="h-3 w-3" />}
            tom="bom"
            destaque
          />
          <Placa
            rotulo="Já usadas"
            valor={String(resumo.usadas)}
            nota={
              resumo.reservadas > 0
                ? `${resumo.reservadas} reservadas agora`
                : "nenhuma reservada agora"
            }
            icone={<TrendingUp aria-hidden className="h-3 w-3" />}
          />
        </div>
      )}

      <Moldura>
        <section className="space-y-3 p-4 md:p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") buscar();
                }}
                placeholder="Nome, telefone ou código"
                className="pl-9"
              />
            </div>
            <Button type="button" onClick={buscar} className="shrink-0">
              Buscar
            </Button>
          </div>

          {/* A busca faz dois trabalhos: filtra quem já é afiliado e oferece
              quem ainda não é. Sem esta linha, a mesma digitação parecia não
              ter achado ninguém. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A mesma busca filtra os afiliados e procura contas para tornar
            afiliadas. Digite pelo menos duas letras do nome ou o telefone.
          </p>

          {candidatos.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                Contas que ainda não são afiliadas
              </p>
              <ul className="space-y-1.5">
                {candidatos.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <b className="font-semibold">{c.name}</b>
                      {c.phone && (
                        <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                          {formatPhone(c.phone)}
                        </span>
                      )}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => ativar(c.id)}
                      className="h-8 shrink-0"
                    >
                      <UserPlus aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                      Tornar afiliado
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </Moldura>

      {afiliados.length === 0 ? (
        <ListaVazia busca={busca} />
      ) : (
        <div className="space-y-3">
          {!busca && total > porPagina && (
            <p className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
              Mostrando os {porPagina} mais recentes de {total}. Busque pelo
              nome ou pelo código para achar alguém específico.
            </p>
          )}
          {afiliados.map((a) => (
            <CartaoDoAfiliado
              key={a.id}
              afiliado={a}
              aberto={aberto === a.id}
              aoAlternar={() => setAberto((atual) => (atual === a.id ? null : a.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A tela sem ninguém na lista.
 *
 * Dois vazios diferentes, e eles pedem respostas diferentes: "a busca não
 * achou" quer que você mude o termo, e "o programa não começou" quer que você
 * entenda o que o programa é antes de ativar a primeira pessoa. Uma frase só
 * para os dois deixava quem chega pela primeira vez sem saber o que a tela
 * queria dele.
 */
function ListaVazia({ busca }: { busca: string }) {
  return (
    <Moldura>
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
          <Link2 aria-hidden className="h-5 w-5 text-muted-foreground" />
        </span>
        {busca ? (
          <>
            <p className="text-sm font-semibold">
              Nenhum afiliado com esse nome ou código.
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Se a pessoa ainda não é afiliada, ela aparece logo acima em
              &ldquo;contas que ainda não são afiliadas&rdquo;, com o botão
              para ativar.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">
              O programa de afiliados ainda não tem ninguém.
            </p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              Não existe autoinscrição: quem entra é decisão sua. Cada afiliado
              ganha um código de indicação e acumula entradas grátis conforme
              quem ele indica compra, e cada entrada vale uma cota em qualquer
              campanha. Busque uma conta pelo nome ou telefone no campo acima
              para ativar a primeira.
            </p>
          </>
        )}
      </div>
    </Moldura>
  );
}

function CartaoDoAfiliado({
  afiliado,
  aberto,
  aoAlternar,
}: {
  afiliado: AfiliadoNaLista;
  aberto: boolean;
  aoAlternar: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [codigo, setCodigo] = useState(afiliado.codigo);
  const [editandoCodigo, setEditandoCodigo] = useState(false);
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [ajustando, setAjustando] = useState(false);

  function trocarStatus(status: AfiliadoNaLista["status"]) {
    startTransition(async () => {
      const r = await definirStatusDoAfiliadoAction({
        userId: afiliado.userId,
        status,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        status === "ACTIVE" ? "Afiliado reativado" : "Afiliado suspenso",
      );
      router.refresh();
    });
  }

  function salvarCodigo() {
    startTransition(async () => {
      const r = await alterarCodigoDoAfiliadoAction({
        userId: afiliado.userId,
        codigo,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Código agora é ${r.data.codigo}`);
      setEditandoCodigo(false);
      router.refresh();
    });
  }

  function ajustar(sinal: 1 | -1) {
    const n = Number.parseInt(quantidade, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Informe quantas entradas");
      return;
    }
    if (motivo.trim().length < 3) {
      toast.error("Escreva o motivo do ajuste");
      return;
    }
    startTransition(async () => {
      const r = await ajustarEntradasAction({
        userId: afiliado.userId,
        quantidade: n * sinal,
        motivo,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.data.aplicadas === 0
          ? "Nada a tirar: as entradas dele já foram usadas"
          : `${r.data.aplicadas > 0 ? "+" : ""}${r.data.aplicadas} entrada(s)`,
      );
      setMotivo("");
      setAjustando(false);
      router.refresh();
    });
  }

  const emDivida = afiliado.progressoEmCentavos < 0;

  return (
    <Moldura>
      <section>
        {/* O CABEÇALHO INTEIRO É O BOTÃO.
            Alvo grande, e não uma setinha de 16px: quem usa o painel no
            celular acerta a linha, não acerta a seta. Só texto aqui dentro,
            porque botão dentro de botão não é HTML válido e o teclado se
            perde; o código vira campo editável só quando o cartão abre. */}
        <button
          type="button"
          onClick={aoAlternar}
          aria-expanded={aberto}
          aria-controls={`afiliado-${afiliado.id}`}
          className={cn(
            "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors md:px-5",
            "hover:bg-white/[0.02]",
            FOCO,
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-base font-bold">
              {afiliado.nome}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  afiliado.status === "ACTIVE" &&
                    "bg-emerald-500/15 text-emerald-400",
                  afiliado.status === "SUSPENDED" &&
                    "bg-amber-500/15 text-amber-400",
                  afiliado.status === "INACTIVE" &&
                    "bg-white/[0.06] text-muted-foreground",
                )}
              >
                {ROTULO_DO_STATUS[afiliado.status]}
              </span>
              <span className="rounded-md border border-primary/30 bg-primary/[0.07] px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest text-primary">
                {afiliado.codigo}
              </span>
            </p>

            {/* FECHADO, A LINHA JÁ RESPONDE.
                Indicados e entradas disponíveis são o que se procura ao
                percorrer a lista; o resto (progresso, reservadas, usadas,
                configuração) é trabalho de quando você já escolheu a pessoa. */}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <span>
                <b className="font-semibold text-foreground">
                  {afiliado.indicados}
                </b>{" "}
                indicado{afiliado.indicados === 1 ? "" : "s"}
              </span>
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <span>
                <b
                  className={cn(
                    "font-semibold",
                    afiliado.disponiveis > 0
                      ? "text-emerald-400"
                      : "text-foreground",
                  )}
                >
                  {afiliado.disponiveis}
                </b>{" "}
                disponíve{afiliado.disponiveis === 1 ? "l" : "is"}
              </span>
              {emDivida && (
                <>
                  <span aria-hidden className="opacity-40">
                    ·
                  </span>
                  {/* Dívida de estorno some se ficar só na placa lá dentro, e
                      é justamente o número que alguém precisa ver de fora. */}
                  <span className="font-semibold text-red-400">
                    progresso negativo
                  </span>
                </>
              )}
              {/* Sem ponto antes do telefone: ele é o item que quebra linha
                  no celular, e o separador ficava sozinho no fim da anterior.
                  O respiro do gap já separa. */}
              <span>
                {afiliado.telefone
                  ? formatPhone(afiliado.telefone)
                  : "sem telefone"}
              </span>
            </p>
          </div>

          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              aberto && "rotate-180",
            )}
          />
        </button>

        {/* A altura anima por grid, e não por max-height chutado: 0fr para 1fr
            fecha exatamente na altura do conteúdo, sem cortar cartão alto nem
            deixar sobra em cartão baixo. */}
        <div
          id={`afiliado-${afiliado.id}`}
          className={cn(
            "grid transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            aberto
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-4 border-t border-white/[0.06] p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Afiliado desde{" "}
                  {new Date(afiliado.desde).toLocaleDateString("pt-BR")}
                </p>
                <div className="flex shrink-0 gap-1.5">
                  {afiliado.status === "ACTIVE" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => trocarStatus("SUSPENDED")}
                      className="h-8"
                    >
                      Suspender
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() => trocarStatus("ACTIVE")}
                      className="h-8"
                    >
                      Reativar
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
          {editandoCodigo ? (
            <>
              <Input
                value={codigo}
                onChange={(e) => setCodigo(normalizarCodigo(e.target.value))}
                className="h-9 max-w-[220px] font-mono tracking-widest uppercase"
                maxLength={20}
              />
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={isPending}
                onClick={salvarCodigo}
              >
                <Check aria-hidden className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setCodigo(afiliado.codigo);
                  setEditandoCodigo(false);
                }}
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setEditandoCodigo(true)}
            >
              <Link2 aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              Trocar o código
            </Button>
          )}
                </div>
                {editandoCodigo && (
                  <p className="text-[11px] text-muted-foreground">
                    O link de indicação usa este código. Trocar não invalida
                    quem já foi indicado.
                  </p>
                )}
              </div>

              {/* As mesmas placas do resto do painel, e não uma caixinha só
                  desta tela: cinco números do mesmo tamanho obrigavam a ler os
                  cinco para achar o que importa. Disponíveis é a que custa
                  dinheiro, progresso negativo é dívida de estorno. */}
              <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Placa
                  rotulo="Indicados"
                  valor={String(afiliado.indicados)}
                  icone={<Users aria-hidden className="h-3 w-3" />}
                />
                <Placa
                  rotulo="Progresso"
                  valor={formatBRL(afiliado.progressoEmCentavos / 100)}
                  nota={`de ${formatBRL(afiliado.config.limiarEmCentavos / 100)} para a próxima entrada`}
                  icone={<TrendingUp aria-hidden className="h-3 w-3" />}
                  tom={emDivida ? "ruim" : "neutro"}
                />
                <Placa
                  rotulo="Disponíveis"
                  valor={String(afiliado.disponiveis)}
                  nota="prontas para usar"
                  icone={<Ticket aria-hidden className="h-3 w-3" />}
                  tom={afiliado.disponiveis > 0 ? "bom" : "neutro"}
                />
                <Placa
                  rotulo="Reservadas e usadas"
                  valor={`${afiliado.reservadas} / ${afiliado.usadas}`}
                  nota="em carrinho aberto / já gastas"
                  icone={<Check aria-hidden className="h-3 w-3" />}
                />
              </dl>

              <ConfigDeRecompensa afiliado={afiliado} />

        {ajustando ? (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                inputMode="numeric"
                className="h-9 w-20 font-mono"
              />
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo do ajuste (obrigatório)"
                className="h-9 min-w-[200px] flex-1"
                maxLength={200}
              />
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={isPending}
                onClick={() => ajustar(1)}
              >
                <Plus aria-hidden className="mr-1 h-3.5 w-3.5" />
                Somar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                disabled={isPending}
                onClick={() => ajustar(-1)}
              >
                <Minus aria-hidden className="mr-1 h-3.5 w-3.5" />
                Tirar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => setAjustando(false)}
              >
                Cancelar
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              O ajuste fica no histórico com o seu nome e o motivo. Tirar só
              alcança entrada ainda disponível: o que já foi usado num sorteio
              não volta.
            </p>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setAjustando(true)}
          >
            <Ticket aria-hidden className="mr-1.5 h-3.5 w-3.5" />
            Ajustar entradas
          </Button>
        )}
            </div>
          </div>
        </div>
      </section>
    </Moldura>
  );
}



/**
 * A configuração de recompensa de um afiliado.
 *
 * Os dois campos de recompensa (porcentagem e valor do cupom) são a mesma
 * coisa em formatos diferentes, e editar um recalcula o outro na hora. Quem
 * manda é o backend: ele deriva o valor do limiar e da porcentagem, e recusa
 * se o que a tela mandou não bater. A tela mostra a conta, ela não é a conta.
 *
 * A prévia em texto existe porque "5000 bps" não é como ninguém pensa: quem
 * está configurando quer ler a frase que o afiliado vai ler.
 */
function ConfigDeRecompensa({ afiliado }: { afiliado: AfiliadoNaLista }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [propria, setPropria] = useState(afiliado.usaConfigPropria);
  const [modo, setModo] = useState<ModoDeRecompensa>(afiliado.config.modo);
  const [degrau, setDegrau] = useState(
    (afiliado.config.degrauEmCentavos / 100).toFixed(2).replace(".", ","),
  );
  const [pctDegrau, setPctDegrau] = useState(
    porcentagemDosBps(afiliado.config.bpsPorDegrau).toFixed(2).replace(".", ","),
  );
  const [limiar, setLimiar] = useState(
    (afiliado.config.limiarEmCentavos / 100).toFixed(2).replace(".", ","),
  );
  const [pct, setPct] = useState(
    porcentagemDosBps(afiliado.config.recompensaEmBps)
      .toFixed(2)
      .replace(".", ","),
  );
  const [valor, setValor] = useState(
    (afiliado.config.valorDoCupomEmCentavos / 100).toFixed(2).replace(".", ","),
  );

  const emCent = (texto: string) => {
    const n = Number.parseFloat(texto.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };
  const limiarCent = emCent(limiar);
  const bps = bpsDaPorcentagem(
    Number.parseFloat(pct.replace(".", "").replace(",", ".")) || 0,
  );
  const valorCent = valorDoCupom(limiarCent, bps);
  const degrauCent = emCent(degrau);
  const bpsDegrau = bpsDaPorcentagem(
    Number.parseFloat(pctDegrau.replace(".", "").replace(",", ".")) || 0,
  );
  const progressivo = modo === "PERCENTUAL_PROGRESSIVO";
  const problema = conferirConfig({
    ...CONFIG_PADRAO,
    modo,
    limiarEmCentavos: limiarCent,
    recompensaEmBps: bps,
    valorDoCupomEmCentavos: valorCent,
    degrauEmCentavos: degrauCent,
    bpsPorDegrau: bpsDegrau,
  });

  // Editar o valor em reais recalcula a porcentagem, e vice-versa.
  function mudarValor(texto: string) {
    setValor(texto);
    const novo = emCent(texto);
    if (limiarCent > 0 && novo > 0) {
      setPct(
        (bpsDoValorDoCupom(limiarCent, novo) / 100).toFixed(2).replace(".", ","),
      );
    }
  }
  function mudarPct(texto: string) {
    setPct(texto);
    const novoBps = bpsDaPorcentagem(
      Number.parseFloat(texto.replace(".", "").replace(",", ".")) || 0,
    );
    setValor(
      (valorDoCupom(limiarCent, novoBps) / 100).toFixed(2).replace(".", ","),
    );
  }

  // Progresso guardado que o novo limiar já cobre vira cupom na hora. É a
  // única consequência imediata de salvar, então ela é dita antes.
  const cuponsImediatos =
    limiarCent > 0 && afiliado.progressoEmCentavos > 0 && !progressivo
      ? Math.floor(afiliado.progressoEmCentavos / limiarCent)
      : 0;

  function salvar() {
    if (propria && problema) {
      toast.error(problema.mensagem);
      return;
    }
    const resumo = !propria
      ? "Voltar para a configuração padrão do programa."
      : progressivo
        ? `A cada ${formatBRL(degrauCent / 100)} gastos por um indicado, +${(bpsDegrau / 100).toLocaleString("pt-BR")}% no cupom dele.`
        : `A cada ${formatBRL(limiarCent / 100)}, 1 cupom de ${formatBRL(valorCent / 100)} (${(bps / 100).toLocaleString("pt-BR")}%).`;
    const aviso =
      cuponsImediatos > 0 && propria
        ? `\n\nEsta alteração gerará imediatamente ${cuponsImediatos} cupom(ns) a partir do progresso já acumulado.`
        : "";
    if (!window.confirm(`${resumo}${aviso}\n\nConfirmar?`)) return;

    startTransition(async () => {
      const r = await definirConfigDeRecompensaAction({
        userId: afiliado.userId,
        usaConfigPropria: propria,
        modo,
        limiarEmCentavos: limiarCent,
        recompensaEmBps: bps,
        valorDoCupomEmCentavos: valorCent,
        degrauEmCentavos: degrauCent,
        bpsPorDegrau: bpsDegrau,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Configuração de recompensa salva");
      setAberto(false);
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setAberto(true)}
        >
          <Percent aria-hidden className="mr-1.5 h-3.5 w-3.5" />
          Configuração de recompensa
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {afiliado.config.modo === "PERCENTUAL_PROGRESSIVO"
            ? `+${porcentagemDosBps(afiliado.config.bpsPorDegrau).toLocaleString("pt-BR")}% a cada ${formatBRL(afiliado.config.degrauEmCentavos / 100)} do indicado`
            : `${formatBRL(afiliado.config.valorDoCupomEmCentavos / 100)} a cada ${formatBRL(afiliado.config.limiarEmCentavos / 100)}`}
          {afiliado.usaConfigPropria ? " (personalizada)" : " (padrão)"}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
        Configuração de recompensa
      </p>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Switch checked={propria} onCheckedChange={setPropria} />
        Usar configuração personalizada
      </label>

      <div className={cn(!propria && "pointer-events-none opacity-50")}>
        <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
          Como a recompensa é calculada
        </span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(
            [
              ["VALOR_FIXO", "Valor fixo por cupom"],
              ["PERCENTUAL_PROGRESSIVO", "Percentual progressivo"],
            ] as const
          ).map(([valorDoModo, rotulo]) => (
            <button
              key={valorDoModo}
              type="button"
              onClick={() => setModo(valorDoModo)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                modo === valorDoModo
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "grid gap-2 sm:grid-cols-3",
          !propria && "pointer-events-none opacity-50",
        )}
      >
        <Campo
          rotulo="Gerar um cupom a cada"
          prefixo="R$"
          valor={limiar}
          aoMudar={(v) => {
            setLimiar(v);
            const novo = emCent(v);
            setValor((valorDoCupom(novo, bps) / 100).toFixed(2).replace(".", ","));
          }}
        />
        {progressivo ? (
          <>
            <Campo
              rotulo="Sobe um degrau a cada"
              prefixo="R$"
              valor={degrau}
              aoMudar={setDegrau}
            />
            <Campo
              rotulo="Aumento por degrau"
              sufixo="%"
              valor={pctDegrau}
              aoMudar={setPctDegrau}
            />
          </>
        ) : (
          <>
            <Campo
              rotulo="Percentual de recompensa"
              sufixo="%"
              valor={pct}
              aoMudar={mudarPct}
            />
            <Campo
              rotulo="Valor de cada cupom"
              prefixo="R$"
              valor={valor}
              aoMudar={mudarValor}
            />
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background/40 px-3 py-2 text-xs leading-relaxed">
        <p className="font-semibold">Com esta configuração:</p>
        {propria ? (
          problema ? (
            <p className="mt-1 text-red-400">{problema.mensagem}</p>
          ) : progressivo ? (
            <>
              <p className="mt-1">
                A porcentagem sobe com o quanto CADA indicado já gastou: a cada{" "}
                {formatBRL(degrauCent / 100)} gastos por ele, mais{" "}
                {(bpsDegrau / 100).toLocaleString("pt-BR")}%. O cupom sai desse
                percentual sobre {formatBRL(limiarCent / 100)}.
              </p>
              <p className="mt-1 text-muted-foreground">
                {[1, 2, 3, 5]
                  .map((n) => {
                    const gasto = n * degrauCent;
                    const p = progressaoDoIndicado({
                      gastoEmCentavos: gasto,
                      degrauEmCentavos: degrauCent,
                      bpsPorDegrau: bpsDegrau,
                    });
                    return `${formatBRL(gasto / 100)} = ${(p.bps / 100).toLocaleString("pt-BR")}%`;
                  })
                  .join("  ·  ")}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Quem gastou menos que {formatBRL(degrauCent / 100)} ainda não
                rende nada, e o progresso fica guardado até render.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1">
                A cada {formatBRL(limiarCent / 100)} pagos pelos indicados,{" "}
                {afiliado.nome.split(" ")[0]} receberá 1 cupom de{" "}
                {formatBRL(valorCent / 100)}.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Equivalente a {(bps / 100).toLocaleString("pt-BR")}% de
                recompensa.
              </p>
            </>
          )
        ) : (
          <p className="mt-1 text-muted-foreground">
            Valem os valores padrão do programa.
          </p>
        )}
        {propria && cuponsImediatos > 0 && (
          <p className="mt-1.5 font-semibold text-amber-500">
            Esta alteração gerará imediatamente {cuponsImediatos} cupom(ns) a
            partir do progresso já acumulado.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={isPending || (propria && problema != null)}
          onClick={salvar}
        >
          Salvar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A mudança vale para os próximos cupons. Os que já foram concedidos
        mantêm o valor com que nasceram.
      </p>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  prefixo,
  sufixo,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  prefixo?: string;
  sufixo?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
        {rotulo}
      </span>
      <span className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5">
        {prefixo && (
          <span className="text-xs text-muted-foreground">{prefixo}</span>
        )}
        <input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          inputMode="decimal"
          className="h-9 w-full min-w-0 bg-transparent font-mono text-sm outline-none"
        />
        {sufixo && (
          <span className="text-xs text-muted-foreground">{sufixo}</span>
        )}
      </span>
    </label>
  );
}
