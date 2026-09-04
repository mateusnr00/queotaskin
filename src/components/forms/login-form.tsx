"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import Link from "next/link";
import { IdCard, Lock } from "lucide-react";

import { loginParticipanteAction } from "@/server/actions/auth";
import { participantLoginSchema, type ParticipantLoginInput } from "@/lib/validations/auth";
import { formatCpf } from "@/lib/cpf";
import { BotaoDeGrade } from "@/components/forms/botao-de-grade";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { caminhoDeRedirecionamentoSeguro } from "@/lib/host";

const ROTULO = "text-[11px] font-semibold uppercase tracking-wider";
const CAMPO = "h-12 pl-11";

// Login do participante: CPF + senha. Nome/telefone nao sao credencial.
export function LoginForm({ aoConcluir }: { aoConcluir?: () => void } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = caminhoDeRedirecionamentoSeguro(
    searchParams.get("redirect") ?? searchParams.get("callbackUrl"),
  );
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ParticipantLoginInput>({
    resolver: zodResolver(participantLoginSchema),
    defaultValues: { cpf: "", senha: "" },
  });

  function onSubmit(values: ParticipantLoginInput) {
    setServerError(null);
    startTransition(async () => {
      const r = await loginParticipanteAction(values);
      if (!r.ok) { setServerError(r.error); toast.error(r.error); return; }
      toast.success("Login realizado");
      if (aoConcluir) return aoConcluir();
      router.refresh();
      router.push(redirectTo);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="cpf" render={({ field }) => (
          <FormItem>
            <FormLabel className={ROTULO}>CPF</FormLabel>
            <FormControl>
              <div className="relative">
                <IdCard className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input inputMode="numeric" autoComplete="username" placeholder="000.000.000-00"
                  className={cn(CAMPO, "tabular-nums")} value={formatCpf(field.value ?? "")}
                  onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} name={field.name} ref={field.ref} />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="senha" render={({ field }) => (
          <FormItem>
            <FormLabel className={ROTULO}>Senha</FormLabel>
            <FormControl>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="password" autoComplete="current-password" placeholder="Sua senha" className={CAMPO} {...field} />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        {serverError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{serverError}</p>
        )}
        <BotaoDeGrade disabled={isPending}>{isPending ? "Entrando..." : "Entrar na conta"}</BotaoDeGrade>
        <Link href="/recuperar-conta" className="block text-center text-xs text-muted-foreground underline">Esqueci minha senha</Link>
      </form>
    </Form>
  );
}
