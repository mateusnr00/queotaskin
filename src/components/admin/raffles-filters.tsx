"use client";

// Barra de filtros da lista de sorteios. Sincroniza com URL query params:
// q (texto), status, privacy, drawDate (YYYY-MM-DD). Submete via Link para
// não precisar de cliente complexo — mas usa useTransition pra spinner suave.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RafflesFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "all");
  const [privacy, setPrivacy] = useState(sp.get("privacy") ?? "all");
  const [drawDate, setDrawDate] = useState(sp.get("drawDate") ?? "");

  function apply() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    if (privacy !== "all") params.set("privacy", privacy);
    if (drawDate) params.set("drawDate", drawDate);
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `?${qs}` : "?");
    });
  }

  const hasAny =
    q.trim() || status !== "all" || privacy !== "all" || drawDate;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <form
        className="grid gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar por título do sorteio..."
            className="pl-9"
          />
        </div>

        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger>
            <SelectValue
              placeholder="Status"
              labels={{
                all: "Todos os status",
                DRAFT: "Rascunho",
                ACTIVE: "Ativo",
                FINISHED: "Encerrado",
                CANCELLED: "Cancelado",
              }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="DRAFT">Rascunho</SelectItem>
            <SelectItem value="ACTIVE">Ativo</SelectItem>
            <SelectItem value="FINISHED">Encerrado</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={privacy} onValueChange={(v) => v && setPrivacy(v)}>
          <SelectTrigger>
            <SelectValue
              placeholder="Privacidade"
              labels={{
                all: "Todas",
                PUBLIC: "Pública",
                PRIVATE: "Privada",
              }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="PUBLIC">Pública</SelectItem>
            <SelectItem value="PRIVATE">Privada</SelectItem>
          </SelectContent>
        </Select>

        <div className="md:col-span-2">
          <Input
            type="date"
            value={drawDate}
            onChange={(e) => setDrawDate(e.target.value)}
            placeholder="Data do sorteio"
          />
        </div>

        <div className="md:col-span-2 flex gap-2">
          <Button type="submit" className="flex-1" disabled={isPending}>
            {isPending ? "Filtrando..." : "Filtrar"}
          </Button>
          {hasAny && (
            <Link
              href="?"
              className={buttonVariants({ variant: "outline", size: "icon" })}
              aria-label="Limpar filtros"
              onClick={() => {
                setQ("");
                setStatus("all");
                setPrivacy("all");
                setDrawDate("");
              }}
            >
              <X className="h-4 w-4" />
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
