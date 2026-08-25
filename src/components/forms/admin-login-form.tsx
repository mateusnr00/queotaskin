"use client";

// Entrada do painel: e-mail + senha.
//
// O site público continua sem senha (nome + celular) porque ali a fricção
// custa venda. Aqui é o contrário: esta conta enxerga CPF, telefone e
// pagamento de todos os clientes, e nome e celular do dono são informação
// que circula publicamente.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";

import { adminLoginAction } from "@/server/actions/auth";
import {
  adminLoginSchema,
  type AdminLoginInput,
} from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function AdminLoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const form = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: AdminLoginInput) {
    setErro(null);
    startTransition(async () => {
      const result = await adminLoginAction(values);
      if (!result.ok) {
        setErro(result.error);
        // Limpa só a senha: refazer o e-mail a cada tentativa irrita sem
        // proteger nada.
        form.setValue("password", "");
        return;
      }
      router.refresh();
      router.push("/admin");
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="voce@exemplo.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {erro && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {erro}
          </p>
        )}

        <Button
          type="submit"
          disabled={isPending}
          className="h-11 w-full font-semibold"
        >
          <LogIn className="mr-2 h-4 w-4" />
          {isPending ? "Entrando..." : "Entrar no painel"}
        </Button>
      </form>
    </Form>
  );
}
