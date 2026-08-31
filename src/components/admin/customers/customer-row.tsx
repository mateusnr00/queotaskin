import Link from "next/link";
import { MessageCircle, Pencil } from "lucide-react";

import { ModBadge } from "@/components/rank/mod-badge";
import { RankBadge } from "@/components/rank/rank-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import { formatCpf, formatPhone } from "@/lib/cpf";
import type { Customer } from "@/server/services/customers";
import { whatsappLink } from "@/server/services/customers";
import { Moldura } from "@/components/ui/moldura";
import { cn } from "@/lib/utils";

/** Iniciais para o avatar: "Mateus Nascimento" -> "MN". */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/** Nome, cargo e contato: o mesmo bloco na linha da tabela e no cartão. */
function Identificacao({ customer }: { customer: Customer }) {
  const editar = `/admin/usuarios/${customer.id}/editar`;
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold">
        {iniciais(customer.name)}
      </span>
      <div className="min-w-0">
        <span className="flex items-center gap-1.5">
          <Link
            href={editar}
            className="block max-w-48 truncate text-sm font-semibold hover:underline"
          >
            {customer.name}
          </Link>
          {customer.role !== "PARTICIPANT" && (
            <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase">
              {customer.role === "AFFILIATE" ? "afiliado" : "admin"}
            </span>
          )}
        </span>
        {/* Telefone e e-mail embaixo do nome. O e-mail tinha coluna própria de
            155px e vinha vazio em 9 de 10 linhas, porque o cliente entra por
            nome e CPF e nunca informa e-mail: só a equipe tem. Coluna que quase
            sempre mostra "-" gasta largura e ensina o olho a pular a faixa. */}
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {customer.phone ? formatPhone(customer.phone) : "sem telefone"}
          {customer.email && (
            <span className="font-sans"> · {customer.email}</span>
          )}
        </span>
      </div>
    </div>
  );
}

/** WhatsApp e editar, os dois caminhos que saem desta lista. */
function Acoes({
  customer,
  sempreVisivel,
}: {
  customer: Customer;
  sempreVisivel?: boolean;
}) {
  const zap = whatsappLink(customer.phone, customer.phoneCountry);
  const editar = `/admin/usuarios/${customer.id}/editar`;
  return (
    <div
      className={cn(
        "flex items-center gap-1",
        !sempreVisivel &&
          "opacity-100 md:opacity-60 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100",
      )}
    >
      {zap ? (
        <a
          href={zap}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir conversa no WhatsApp com ${customer.name}`}
          title="Conversar no WhatsApp"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-500 transition-colors hover:bg-emerald-500/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      ) : (
        <span
          className="inline-flex h-9 w-9 items-center justify-center text-xs text-muted-foreground"
          title="Sem telefone cadastrado"
        >
          -
        </span>
      )}
      <Link
        href={editar}
        aria-label={`Editar cadastro de ${customer.name}`}
        title="Editar cadastro"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** O selo de patente, ou o de moderador quando a pessoa é da equipe. */
function Patente({ customer }: { customer: Customer }) {
  // Moderador mostra o cargo no lugar do nível: quem administra precisa
  // reconhecer a equipe de relance.
  return customer.showModBadge ? (
    <ModBadge size={26} uid={`mod-${customer.id}`} />
  ) : (
    // Com o gasto junto, senão o GOAT nunca aparece: ele é o único degrau
    // com exigência financeira, e sem o segundo argumento a conta trata todo
    // mundo como quem gastou zero.
    <RankBadge xp={customer.xp} totalSpent={customer.spent} size="sm" />
  );
}

/**
 * O cliente em cartão, para o celular.
 *
 * A tabela tem oito colunas. Num telefone ela cabia dentro de um rolador
 * horizontal, e o que aparecia sem arrastar era o nome e um pedaço do CPF:
 * gasto, pedidos e última compra, que são a razão de abrir esta tela, ficavam
 * fora de vista. Empilhado, cada cliente é um bloco fechado.
 */
export function CartaoDeCliente({ customer }: { customer: Customer }) {
  const nuncaComprou = customer.purchases === 0;
  return (
    <Moldura>
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <Identificacao customer={customer} />
          <Patente customer={customer} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Dado rotulo="Pedidos" valor={String(customer.purchases)} />
          <Dado
            rotulo="Números"
            valor={customer.tickets.toLocaleString("pt-BR")}
          />
          <Dado
            rotulo="Gasto"
            valor={formatBRL(customer.spent)}
            // Verde só em quem gastou: zero pintado de verde é dinheiro que
            // não existe recebendo a cor de dinheiro.
            className={nuncaComprou ? "" : "text-emerald-500"}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {customer.cpf ? formatCpf(customer.cpf) : "sem CPF"}
            {customer.lastPurchaseAt
              ? ` · última em ${formatDate(customer.lastPurchaseAt)}`
              : " · sem compras"}
          </span>
          <Acoes customer={customer} sempreVisivel />
        </div>
      </div>
    </Moldura>
  );
}

function Dado({
  rotulo,
  valor,
  className,
}: {
  rotulo: string;
  valor: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-2.5 py-2">
      <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
        {rotulo}
      </p>
      <p className={cn("text-sm font-bold tabular-nums", className)}>{valor}</p>
    </div>
  );
}

export function CustomerRow({ customer }: { customer: Customer }) {
  const nuncaComprou = customer.purchases === 0;

  return (
    <TableRow className="group transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.03]">
      <TableCell>
        <Identificacao customer={customer} />
      </TableCell>

      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
        {customer.cpf ? formatCpf(customer.cpf) : "-"}
      </TableCell>

      <TableCell>
        <Patente customer={customer} />
      </TableCell>

      <TableCell className="text-right text-sm tabular-nums">
        {customer.purchases}
      </TableCell>

      <TableCell className="text-right text-sm tabular-nums">
        {customer.tickets.toLocaleString("pt-BR")}
      </TableCell>

      {/* Verde só em quem gastou. Zero pintado de verde é dinheiro que não
          existe recebendo a cor de dinheiro, e numa lista ordenada por gasto
          a faixa de baixo inteira ficava verde dizendo nada. */}
      <TableCell
        className={cn(
          "text-right text-sm tabular-nums",
          nuncaComprou ? "text-muted-foreground" : "font-bold text-emerald-500",
        )}
      >
        {formatBRL(customer.spent)}
      </TableCell>

      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt) : "-"}
      </TableCell>

      <TableCell className="text-right">
        {/* A coluna se chamava "Zap" e trazia dois botões: o do WhatsApp e o
            de editar. O rótulo nomeava um dos dois, então o outro ficava sem
            explicação e o próprio dono da operação perguntou para que servia.
            Agora o cabeçalho diz "Ações" e cada botão tem nome acessível
            próprio, não só title.

            Aparecem no hover no desktop e ficam sempre visíveis no toque, que
            não tem hover: escondê-las lá seria escondê-las de vez. */}
        <div className="flex justify-end">
          <Acoes customer={customer} />
        </div>
      </TableCell>
    </TableRow>
  );
}
