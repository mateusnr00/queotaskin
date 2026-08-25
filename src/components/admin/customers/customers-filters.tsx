"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

const ORDENACOES = [
  { valor: "spent", rotulo: "Maior gasto" },
  { valor: "recent", rotulo: "Compra mais recente" },
  { valor: "purchases", rotulo: "Mais compras" },
  { valor: "name", rotulo: "Nome (A–Z)" },
] as const;

/**
 * Busca e ordenação da lista de clientes.
 *
 * O estado vive na URL, não no componente: assim o admin pode compartilhar
 * ou favoritar uma busca, e o botão voltar do navegador funciona.
 */
export function CustomersFilters({
  search,
  sort,
}: {
  search: string;
  sort: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pendente, iniciarTransicao] = useTransition();

  function atualizar(campo: string, valor: string) {
    const novos = new URLSearchParams(params.toString());
    if (valor) novos.set(campo, valor);
    else novos.delete(campo);
    // Qualquer mudança de filtro volta pra primeira página — senão o admin
    // busca um nome e cai numa página 3 que não existe no novo resultado.
    novos.delete("page");
    iniciarTransicao(() => router.push(`/admin/clientes?${novos.toString()}`));
  }

  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const campo = new FormData(e.currentTarget).get("search");
        atualizar("search", String(campo ?? ""));
      }}
    >
      <div className="relative min-w-56 flex-1">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="search"
          defaultValue={search}
          placeholder="Buscar por nome, telefone ou e-mail"
          className="pl-9"
        />
      </div>

      <select
        value={sort}
        onChange={(e) => atualizar("sort", e.target.value)}
        aria-label="Ordenar por"
        className="h-9 rounded-md border bg-background px-3 text-sm"
      >
        {ORDENACOES.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={pendente}
        className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pendente ? "Buscando..." : "Buscar"}
      </button>
    </form>
  );
}
