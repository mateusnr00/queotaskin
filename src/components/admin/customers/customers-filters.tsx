"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ORDENACOES = [
  { valor: "spent", rotulo: "Maior gasto" },
  { valor: "recent", rotulo: "Compra mais recente" },
  { valor: "purchases", rotulo: "Mais pedidos" },
  { valor: "name", rotulo: "Nome (A–Z)" },
] as const;

export interface FiltrosCliente {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  sort: string;
}

/**
 * Filtros da lista de clientes.
 *
 * Campos separados em vez de uma busca única: quem opera rifa procura por
 * CPF quando o cliente liga reclamando de pagamento, e por telefone quando
 * chega mensagem no WhatsApp — misturar tudo num campo só faria a busca por
 * "11" casar com telefone, CPF e qualquer nome que tenha "11".
 *
 * O estado vive na URL: dá para favoritar um recorte e o voltar funciona.
 */
export function CustomersFilters({ filtros }: { filtros: FiltrosCliente }) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();

  const temFiltro = Boolean(
    filtros.nome || filtros.cpf || filtros.email || filtros.telefone,
  );

  function enviar(dados: FormData) {
    const params = new URLSearchParams();
    for (const campo of ["nome", "cpf", "email", "telefone"] as const) {
      const valor = String(dados.get(campo) ?? "").trim();
      if (valor) params.set(campo, valor);
    }
    const sort = String(dados.get("sort") ?? "");
    if (sort && sort !== "spent") params.set("sort", sort);
    // Filtro novo sempre volta pra primeira página: buscar um nome e cair
    // numa página 3 que não existe no novo resultado seria confuso.
    const qs = params.toString();
    iniciarTransicao(() =>
      router.push(qs ? `/admin/clientes?${qs}` : "/admin/clientes"),
    );
  }

  return (
    <form action={enviar} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Nome" name="nome" defaultValue={filtros.nome} placeholder="João da Silva" />
        <Campo
          label="CPF"
          name="cpf"
          defaultValue={filtros.cpf}
          placeholder="000.000.000-00"
          inputMode="numeric"
        />
        <Campo
          label="E-mail"
          name="email"
          defaultValue={filtros.email}
          placeholder="cliente@email.com"
        />
        <Campo
          label="Telefone"
          name="telefone"
          defaultValue={filtros.telefone}
          placeholder="(62) 99999-9999"
          inputMode="numeric"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Ordenar por</Label>
          <select
            name="sort"
            defaultValue={filtros.sort}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {ORDENACOES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={pendente}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Search className="h-4 w-4" />
          {pendente ? "Buscando..." : "Pesquisar"}
        </button>

        {temFiltro && (
          <button
            type="button"
            onClick={() => iniciarTransicao(() => router.push("/admin/clientes"))}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>
    </form>
  );
}

function Campo({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input {...props} />
    </div>
  );
}
