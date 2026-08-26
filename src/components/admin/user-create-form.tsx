"use client";

// Criação de conta pelo painel.
//
// Os campos obrigatórios mudam com o papel, e isso é de propósito: cliente
// entra por nome + CPF, admin entra por e-mail + senha. Pedir os quatro de
// todo mundo criaria campo inventado na maioria dos cadastros, e não pedir
// nenhum produziria conta que parece certa e não deixa a pessoa entrar.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

import { criarUsuarioAction } from "@/server/actions/users";
import { userCreateSchema, type UserCreateInput } from "@/lib/validations/auth";
import { formatCpf, formatPhone } from "@/lib/cpf";
import { SenhaGerada } from "@/components/admin/senha-gerada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAPEIS = [
  { value: "PARTICIPANT", label: "Cliente", ajuda: "Compra números. Entra em queotaskin.com com nome e CPF." },
  { value: "AFFILIATE", label: "Afiliado", ajuda: "Divulga campanhas e acompanha as próprias vendas." },
  { value: "ADMIN", label: "Admin", ajuda: "Painel completo: campanhas, clientes, pagamentos e usuários." },
  { value: "SUPER_ADMIN", label: "Dono da plataforma", ajuda: "Tudo do Admin, e ainda pode conceder e revogar este papel." },
] as const;

export function UserCreateForm({ souDono }: { souDono: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [senhaGerada, setSenhaGerada] = useState<{
    senha: string;
    email: string | null;
  } | null>(null);

  // Conceder "dono da plataforma" só aparece para quem já é. O servidor
  // recusa de qualquer forma; esconder aqui evita oferecer algo que a pessoa
  // vai escolher e levar erro depois.
  const papeis = souDono ? PAPEIS : PAPEIS.filter((p) => p.value !== "SUPER_ADMIN");

  const form = useForm<UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: {
      name: "",
      email: "",
      cpf: "",
      phone: "",
      role: "PARTICIPANT",
    },
  });

  const papel = form.watch("role");
  const ehDePainel = papel === "ADMIN" || papel === "SUPER_ADMIN";

  function onSubmit(values: UserCreateInput) {
    startTransition(async () => {
      const r = await criarUsuarioAction(values);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) {
          for (const [campo, msgs] of Object.entries(r.fieldErrors)) {
            if (msgs?.[0]) {
              form.setError(campo as keyof UserCreateInput, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }

      toast.success("Conta criada");

      // Com senha, a tela fica: ela aparece uma vez só e sair da página
      // levaria embora a única cópia. Sem senha, não há o que mostrar.
      if (r.data.senhaTemporaria) {
        setSenhaGerada({
          senha: r.data.senhaTemporaria,
          email: values.email || null,
        });
        form.reset();
        router.refresh();
        return;
      }
      router.push("/admin/clientes");
      router.refresh();
    });
  }

  if (senhaGerada) {
    return (
      <div className="max-w-xl space-y-4">
        <SenhaGerada
          senha={senhaGerada.senha}
          email={senhaGerada.email}
          aoFechar={() => setSenhaGerada(null)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setSenhaGerada(null)}>
            Criar outra conta
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/clientes")}
          >
            Ir para Clientes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="max-w-xl space-y-5"
      >
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Papel</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      labels={Object.fromEntries(
                        papeis.map((p) => [p.value, p.label])
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {papeis.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                {papeis.find((p) => p.value === field.value)?.ajuda}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo *</FormLabel>
              <FormControl>
                <Input autoComplete="off" placeholder="Maria da Silva" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail {ehDePainel && "*"}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="pessoa@exemplo.com"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {ehDePainel
                  ? "É com ele que a pessoa entra em admin.queotaskin.com."
                  : "Opcional. Cliente entra por nome e CPF, o e-mail aqui é só contato."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cpf"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CPF {papel === "PARTICIPANT" && "*"}</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000.000.000-00"
                  value={field.value}
                  onChange={(e) => {
                    const digitos = e.target.value.replace(/\D/g, "").slice(0, 11);
                    field.onChange(
                      digitos.length === 11 ? formatCpf(digitos) : digitos
                    );
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormDescription>
                {papel === "PARTICIPANT"
                  ? "É a senha do cliente: ele entra com nome e CPF."
                  : "Opcional para conta de painel."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Celular</FormLabel>
              <FormControl>
                <Input
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="(62) 99999-9999"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const digitos = e.target.value.replace(/\D/g, "").slice(0, 11);
                    field.onChange(
                      digitos.length >= 10 ? formatPhone(digitos) : digitos
                    );
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormDescription>Opcional. DDD + número.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {ehDePainel && (
          <div className="flex items-start gap-2.5 rounded-xl border bg-muted/20 p-3.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              A senha é sorteada na hora e aparece uma vez só, para você
              repassar. Ninguém digita senha por outra pessoa aqui, e no
              primeiro acesso o painel exige que ela escolha a própria.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Criando..." : "Criar conta"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/clientes")}
            disabled={isPending}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
