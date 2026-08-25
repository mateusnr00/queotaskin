"use client";

// Barra de filtros da lista de usuários — espelha o Sorteamos:
// Função (select), Nome, CPF, Email, Telefone.
// Sincroniza com URL params; aplica via push (server re-renderiza).

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Mail, Phone, Search, User, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function UsersFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [role, setRole] = useState(sp.get("role") ?? "all");
  const [name, setName] = useState(sp.get("name") ?? "");
  const [cpf, setCpf] = useState(sp.get("cpf") ?? "");
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [phone, setPhone] = useState(sp.get("phone") ?? "");

  function apply() {
    const params = new URLSearchParams();
    if (role !== "all") params.set("role", role);
    if (name.trim()) params.set("name", name.trim());
    if (cpf.trim()) params.set("cpf", cpf.trim());
    if (email.trim()) params.set("email", email.trim());
    if (phone.trim()) params.set("phone", phone.trim());
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `?${qs}` : "?");
    });
  }

  const hasAny =
    role !== "all" || name.trim() || cpf.trim() || email.trim() || phone.trim();

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <form
        className="grid gap-3 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Select value={role} onValueChange={(v) => v && setRole(v)}>
          <SelectTrigger>
            <SelectValue
              placeholder="Função"
              labels={{
                all: "Todas as funções",
                PARTICIPANT: "Participante",
                AFFILIATE: "Afiliado",
                ADMIN: "Admin",
              }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as funções</SelectItem>
            <SelectItem value="PARTICIPANT">Participante</SelectItem>
            <SelectItem value="AFFILIATE">Afiliado</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>

        <FilterInput
          value={name}
          onChange={setName}
          placeholder="Nome"
          icon={User}
        />
        <FilterInput
          value={cpf}
          onChange={setCpf}
          placeholder="CPF"
          icon={Search}
          inputMode="numeric"
        />
        <FilterInput
          value={email}
          onChange={setEmail}
          placeholder="E-mail"
          icon={Mail}
        />
        <FilterInput
          value={phone}
          onChange={setPhone}
          placeholder="Telefone"
          icon={Phone}
          inputMode="tel"
        />

        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={isPending} size="lg">
            <Search className="mr-2 h-4 w-4" />
            {isPending ? "Filtrando..." : "Pesquisar"}
          </Button>
          {hasAny && (
            <Link
              href="?"
              className={buttonVariants({ variant: "outline", size: "icon" })}
              aria-label="Limpar"
              onClick={() => {
                setRole("all");
                setName("");
                setCpf("");
                setEmail("");
                setPhone("");
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

function FilterInput({
  value,
  onChange,
  placeholder,
  icon: Icon,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  inputMode?: "text" | "numeric" | "tel" | "email";
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="pl-9"
      />
    </div>
  );
}
