"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { loginAction, registerAction } from "@/server/actions/auth";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { formatCpf, formatPhone } from "@/lib/cpf";
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

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // NextAuth v5 manda ?callbackUrl= quando bate numa rota protegida; nossas
  // próprias telas mandam ?redirect=. Aceita os dois.
  const redirectTo =
    searchParams.get("redirect") ?? searchParams.get("callbackUrl") ?? "/";
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      cpf: "",
      phone: "",
    },
  });

  function onSubmit(values: RegisterInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await registerAction(values);
      if (!result.ok) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      // Loga automaticamente após registro, login é por nome + CPF, sem
      // senha. O celular fica guardado para a operação falar com o cliente.
      const login = await loginAction({
        name: values.name,
        cpf: values.cpf,
      });
      if (!login.ok) {
        toast.success("Conta criada. Faça login para continuar");
        router.push(`/login?redirect=${encodeURIComponent(redirectTo)}`);
        return;
      }
      toast.success("Conta criada com sucesso");
      router.refresh();
      router.push(redirectTo);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input
                  autoComplete="name"
                  placeholder="Maria da Silva"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cpf"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CPF</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000.000.000-00"
                  value={field.value}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 11);
                    field.onChange(
                      digits.length === 11 ? formatCpf(digits) : digits
                    );
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Celular *</FormLabel>
              <FormControl>
                <Input
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                  value={field.value}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 11);
                    field.onChange(
                      digits.length >= 10 ? formatPhone(digits) : digits
                    );
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              {/* O celular não entra no login, então sem esta linha ele
                  parece um campo pedido à toa. É por ele que a operação
                  fala com quem comprou. */}
              <FormDescription>
                É por aqui que falamos com você sobre o pagamento e a entrega
                do prêmio.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverError && (
          <p className="text-sm font-medium text-destructive">{serverError}</p>
        )}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Criando conta..." : "Criar conta"}
        </Button>
      </form>
    </Form>
  );
}
