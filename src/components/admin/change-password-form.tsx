"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

import { changeOwnPasswordAction } from "@/server/actions/auth";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { AdminStepUp } from "@/components/admin/admin-step-up";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function ChangePasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState<ChangePasswordInput | null>(null);

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  function onSubmit(values: ChangePasswordInput) {
    setErro(null);
    executar(values, "");
  }

  // Tenta sem step-up; se o backend exigir reauth (MFA ativa), abre o modal.
  function executar(values: ChangePasswordInput, totp: string) {
    startTransition(async () => {
      const result = await changeOwnPasswordAction({ ...values, totp });
      if (!result.ok) {
        if (/seguranca \(MFA\)/i.test(result.error) && !totp) {
          setPendente(values);
          return;
        }
        setErro(result.error);
        return;
      }
      setPendente(null);
      form.reset();
      toast.success("Senha alterada. Entre novamente por seguranca.");
      router.refresh();
      router.push("/admin");
    });
  }

  if (pendente) {
    const vals = pendente;
    return (
      <AdminStepUp
        titulo="Confirmar troca de senha"
        pending={isPending}
        onConfirmar={(totp) => { setPendente(null); executar(vals, totp); }}
        onCancelar={() => setPendente(null)}
      />
    );
  }

  return (
    <Card className="p-5">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha atual</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nova senha</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormDescription>
                  Pelo menos 10 caracteres. Esta conta enxerga os dados de todos
                  os clientes, então vale usar algo que você não use em outro lugar.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Repita a nova senha</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
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

          <Button type="submit" disabled={isPending} className="h-11 w-full font-semibold">
            <KeyRound className="mr-2 h-4 w-4" />
            {isPending ? "Salvando..." : "Salvar nova senha"}
          </Button>
        </form>
      </Form>
    </Card>
  );
}
