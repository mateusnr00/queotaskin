"use client";

import { useRouter } from "next/navigation";
import { Moldura } from "@/components/ui/moldura";
import { useState, useTransition } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ORDENACOES = [
  { valor: "spent", rotulo: "Maior gasto" },
  { valor: "recent", rotulo: "Compra mais recente" },
  { valor: "purchases", rotulo: "Mais pedidos" },
  { valor: "name", rotulo: "Nome (A–Z)" },
] as const;

/** value→rótulo. O Select do projeto mostra o value cru sem este mapa. */
const ROTULO_DA_ORDEM = Object.fromEntries(
  ORDENACOES.map((o) => [o.valor, o.rotulo]),
);

export interface FiltrosCliente {
  busca: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  sort: string;
}

/**
 * Filtros da lista de clientes.
 *
 * Eram quatro caixas sempre abertas, nome, CPF, e-mail e telefone, mais a
 * ordenação e o botão. Medido, o bloco fazia parte dos 470px que a tela
 * gastava antes da primeira linha de cliente aparecer, numa janela de 900:
 * mais da metade do que se vê era moldura.
 *
 * O argumento para ter quatro campos era bom, e continua valendo: quem opera
 * rifa procura por CPF quando o cliente liga reclamando de pagamento, e um
 * campo só faria "11" casar com telefone, CPF e nome ao mesmo tempo. O erro
 * estava na conclusão. Respeitar isso não é obrigar a escolher a caixa certa
 * antes de digitar, é olhar o que foi digitado: a regra vive em
 * interpretarBusca, com teste, e os quatro campos continuam existindo atrás
 * de "busca avançada" para quando alguém precisa mesmo restringir.
 *
 * O estado vive na URL: dá para favoritar um recorte e o voltar funciona.
 */
export function CustomersFilters({ filtros }: { filtros: FiltrosCliente }) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();

  const temEspecifico = Boolean(
    filtros.nome || filtros.cpf || filtros.email || filtros.telefone,
  );
  // Já aberta quando algum campo específico está em uso: fechada, a pessoa
  // veria uma lista filtrada sem nada na tela explicando por quê.
  const [avancada, setAvancada] = useState(temEspecifico);
  const [ordem, setOrdem] = useState(filtros.sort);
  const temFiltro = temEspecifico || Boolean(filtros.busca);

  function enviar(dados: FormData) {
    const params = new URLSearchParams();
    for (const campo of [
      "busca",
      "nome",
      "cpf",
      "email",
      "telefone",
    ] as const) {
      const valor = String(dados.get(campo) ?? "").trim();
      if (valor) params.set(campo, valor);
    }
    if (ordem && ordem !== "spent") params.set("sort", ordem);
    // Filtro novo sempre volta pra primeira página: buscar um nome e cair
    // numa página 3 que não existe no novo resultado seria confuso.
    const qs = params.toString();
    iniciarTransicao(() =>
      router.push(qs ? `/admin/clientes?${qs}` : "/admin/clientes"),
    );
  }

  return (
    <Moldura>
      <form action={enviar} className="p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Uma linha, e a busca ocupa o que sobra. É a ação de 90% das
            visitas: achar uma pessoa. */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="busca"
              defaultValue={filtros.busca}
              placeholder="Nome, CPF, telefone ou e-mail"
              aria-label="Buscar cliente por nome, CPF, telefone ou e-mail"
              className="h-10 pl-9"
            />
          </div>

          <Select value={ordem} onValueChange={(v) => v && setOrdem(v)}>
            {/* Select do projeto, e não <select> nativo: o menu do nativo é
              desenhado pelo sistema e não aceita estilo, então no tema escuro
              ele abre branco. Já aconteceu no seletor de país do cadastro. */}
            <SelectTrigger
              aria-label="Ordenar por"
              className="h-10 w-[190px] shrink-0"
            >
              <SelectValue labels={ROTULO_DA_ORDEM} />
            </SelectTrigger>
            <SelectContent>
              {ORDENACOES.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="submit"
            disabled={pendente}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {pendente ? "Buscando..." : "Buscar"}
          </button>

          {temFiltro && (
            <button
              type="button"
              onClick={() =>
                iniciarTransicao(() => router.push("/admin/clientes"))
              }
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
              Limpar
            </button>
          )}

          <button
            type="button"
            onClick={() => setAvancada((v) => !v)}
            aria-expanded={avancada}
            aria-controls="busca-avancada"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Avançada
            <ChevronDown
              aria-hidden
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                avancada && "rotate-180",
              )}
            />
          </button>
        </div>

        {/* Os campos continuam no DOM quando fechados para o formulário não
          perder o que já estava preenchido ao recolher a seção. */}
        <div
          id="busca-avancada"
          className={cn(
            "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
            avancada ? "mt-3 border-t pt-3" : "hidden",
          )}
        >
          <Campo
            label="Nome"
            name="nome"
            defaultValue={filtros.nome}
            placeholder="João da Silva"
          />
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
      </form>
    </Moldura>
  );
}

function Campo({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Input {...props} />
    </div>
  );
}
