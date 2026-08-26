"use client";

// Tela de "Você tem N caixas pra abrir!" que aparece no comprovante
// pós-pagamento (status PAID) quando a rifa tem Caixas Surpresas ativas
// e o comprador atingiu algum combo.
//
// Cada caixa não-aberta tem botão "Abrir" individual. Se a rifa permite
// "Abrir Todas", aparece também um botão pra abrir todas de uma vez.
// Caixas já abertas viram o resultado:
//   - OPENED_PRIZE: faixa laranja com a descrição do prêmio
//   - OPENED_EMPTY: card apagado, "Não foi dessa vez"
//
// Segurança: a server action openSurpriseBoxAction é a única fonte de
// verdade do resultado. O frontend só renderiza o que o servidor devolve.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Gift, Loader2, PackageOpen } from "lucide-react";

import {
  openSurpriseBoxAction,
  type OpenedBoxResult,
} from "@/server/actions/surprise-boxes";
import { CaixaSurpresaArte } from "@/components/public/caixa-surpresa-arte";
import { EstouroDeConfete } from "@/components/public/estouro-de-confete";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SurpriseBoxClaimItem {
  id: string;
  status: "UNOPENED" | "OPENED_PRIZE" | "OPENED_EMPTY";
  prize: { title: string; prize: string } | null;
}

interface Props {
  reservationId: string;
  boxes: SurpriseBoxClaimItem[];
  allowOpenAll: boolean;
}

const INITIAL_VISIBLE = 5;

const TAMANHO_DA_ARTE = 56;

/**
 * Tempos da abertura, em ms. Precisam casar com a classe `.caixa-abrindo`
 * do globals.css, que encadeia levanta (220) + treme (380 x2) + estoura
 * (180) e fecha em 1160.
 *
 * ATRASO_DO_ESTOURO é quando o papel voa: no fim do tremor, junto com a
 * caixa sumindo. DURACAO_DA_ABERTURA é quando o resultado entra, e fica
 * depois do estouro de propósito. Trocar antes deixaria a troca à vista;
 * trocar muito depois mostraria a linha vazia entre uma coisa e outra.
 */
const ATRASO_DO_ESTOURO = 940;
const DURACAO_DA_ABERTURA = 1120;
const DURACAO_DO_CONFETE = 2000;

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Movimento é enfeite; o prêmio é o que a pessoa quer. Quem pediu menos
 * movimento no sistema recebe o resultado na hora, sem tremor nem papel.
 */
function querMenosMovimento() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function SurpriseBoxesClaim({
  reservationId,
  boxes: initialBoxes,
  allowOpenAll,
}: Props) {
  const [boxes, setBoxes] = useState(initialBoxes);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [confeteId, setConfeteId] = useState<string | null>(null);
  const [allPending, startAllTransition] = useTransition();
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  // O papel voa por mais tempo do que a abertura dura, então quem limpa o
  // estouro é um relógio próprio. Se a pessoa sair da página no meio, o
  // relógio precisa morrer junto.
  const relogioDoConfete = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (relogioDoConfete.current) clearTimeout(relogioDoConfete.current);
    };
  }, []);

  const unopenedCount = useMemo(
    () => boxes.filter((b) => b.status === "UNOPENED").length,
    [boxes]
  );

  async function openOne(boxId: string) {
    const comAnimacao = !querMenosMovimento();
    setOpeningId(boxId);

    if (comAnimacao) {
      setConfeteId(boxId);
      if (relogioDoConfete.current) clearTimeout(relogioDoConfete.current);
      relogioDoConfete.current = setTimeout(
        () => setConfeteId(null),
        DURACAO_DO_CONFETE
      );
    }

    // O pedido sai junto com a animação, não depois dela. Encadeado, a
    // pessoa esperaria a rede e mais 1,1s; em paralelo, a espera é o maior
    // dos dois, e na prática o servidor responde antes do papel voar.
    const [result] = await Promise.all([
      openSurpriseBoxAction({ reservationId, boxId }),
      comAnimacao ? esperar(DURACAO_DA_ABERTURA) : Promise.resolve(),
    ]);

    setOpeningId(null);
    if (!result.ok) {
      setConfeteId(null);
      toast.error(result.error);
      return;
    }
    applyResult(boxId, result.data);
  }

  function applyResult(boxId: string, data: OpenedBoxResult) {
    setBoxes((prev) =>
      prev.map((b) =>
        b.id === boxId
          ? {
              ...b,
              status: data.status,
              prize: data.prize
                ? { title: data.prize.title, prize: data.prize.prize }
                : null,
            }
          : b
      )
    );
    if (data.status === "OPENED_PRIZE" && data.prize) {
      toast.success(`Você ganhou: ${data.prize.prize}!`);
    }
  }

  function openAll() {
    const targets = boxes.filter((b) => b.status === "UNOPENED");
    if (targets.length === 0) return;
    startAllTransition(async () => {
      // Sem a animação por caixa aqui: vinte aberturas de 1,1s seriam vinte
      // segundos de espera. Quem clica em "Abrir todas" está pedindo o
      // resultado, não a cerimônia.
      //
      // Serializa as aberturas, evita disparar N requests paralelas que
      // brigariam pelo mesmo pool de prêmios.
      for (const b of targets) {
        const result = await openSurpriseBoxAction({
          reservationId,
          boxId: b.id,
        });
        if (!result.ok) {
          toast.error(result.error);
          continue;
        }
        applyResult(b.id, result.data);
      }
    });
  }

  if (boxes.length === 0) return null;

  const travado = allPending || openingId !== null;

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      {/* Título em texto corrido, e não numa flex row. Como flex, cada
          pedaço virava um item e a frase quebrava em "Você tem / 3 / caixas
          para / abrir!" na largura do celular. O ícone saiu junto: a arte da
          caixa aparece logo abaixo, uma vez por caixa. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">
          Você tem{" "}
          <span className="text-amber-600 dark:text-amber-400">
            {unopenedCount}
          </span>{" "}
          caixa{unopenedCount === 1 ? "" : "s"} para abrir!
        </h3>
        {allowOpenAll && unopenedCount > 1 && (
          <Button
            type="button"
            size="sm"
            onClick={openAll}
            disabled={travado}
            className="ml-auto bg-amber-500 hover:bg-amber-600 text-white"
          >
            {allPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Abrir todas
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {boxes.slice(0, visible).map((b) => (
          // relative porque o estouro é uma camada em cima da linha, e
          // precisa continuar depois que a linha já virou resultado.
          <li key={b.id} className="relative">
            <BoxRow
              box={b}
              abrindo={openingId === b.id}
              travado={travado}
              onOpen={() => openOne(b.id)}
            />
            {confeteId === b.id && (
              <EstouroDeConfete
                // p-3 da linha mais metade da arte: o centro da caixa.
                x={12 + TAMANHO_DA_ARTE / 2}
                atraso={ATRASO_DO_ESTOURO}
              />
            )}
          </li>
        ))}
      </ul>

      {boxes.length > visible && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + INITIAL_VISIBLE)}
            className="text-sm text-amber-600 hover:text-amber-700 hover:underline"
          >
            Mostrar mais ({boxes.length - visible})
          </button>
        </div>
      )}
    </div>
  );
}

function BoxRow({
  box,
  abrindo,
  travado,
  onOpen,
}: {
  box: SurpriseBoxClaimItem;
  abrindo: boolean;
  travado: boolean;
  onOpen: () => void;
}) {
  if (box.status === "UNOPENED") {
    return (
      <div className="rounded-xl border bg-muted/30 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* A arte no lugar do ícone: aqui a caixa não é um marcador ao lado
              de um texto, é o objeto que a pessoa está prestes a abrir. */}
          <CaixaSurpresaArte
            tamanho={TAMANHO_DA_ARTE}
            className={cn(abrindo && "caixa-abrindo")}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Caixa Surpresa</p>
            <p className="text-xs text-muted-foreground">
              {abrindo ? "Abrindo…" : "Abra pra revelar o prêmio"}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onOpen}
          disabled={travado}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          {abrindo && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Abrir
        </Button>
      </div>
    );
  }

  // Caixa vazia não usa a faixa laranja da premiada. Nem toda caixa tem
  // item, e vestir "não ganhou" com a mesma roupa de "ganhou" faz a pessoa
  // ler a linha duas vezes para entender o que aconteceu.
  if (box.status === "OPENED_EMPTY" || !box.prize) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <PackageOpen className="h-6 w-6 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              Não foi dessa vez
            </p>
            <p className="text-xs leading-tight text-muted-foreground">
              Esta caixa veio vazia.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          ABERTA
        </Badge>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 p-3 flex items-center justify-between gap-3 shadow-sm">
      <div className="flex items-center gap-2 min-w-0 text-white">
        <Gift className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight truncate">
            {box.prize.title || "Caixa Surpresa"}
          </p>
          <p className="text-xs leading-tight truncate">{box.prize.prize}</p>
        </div>
      </div>
      <Badge className="bg-white/95 text-amber-700 hover:bg-white tabular-nums text-[10px]">
        ABERTA
      </Badge>
    </div>
  );
}
