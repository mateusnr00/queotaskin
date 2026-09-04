"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { IdCard, KeyRound } from "lucide-react";

import {
  solicitarCodigoDeLoginAction,
  entrarComCodigoAction,
} from "@/server/actions/auth";
import {
  cpfLoginSchema,
  otpCodigoSchema,
  type CpfLoginInput,
  type OtpCodigoInput,
} from "@/lib/validations/auth";
import { formatCpf } from "@/lib/cpf";
import { BotaoDeGrade } from "@/components/forms/botao-de-grade";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { caminhoDeRedirecionamentoSeguro } from "@/lib/host";

const ROTULO = "text-[11px] font-semibold uppercase tracking-wider";
const CAMPO = "h-12 pl-11";

// Login em dois passos: CPF (identificador) -> código enviado ao telefone da
// conta. Nome nunca mais é credencial. Enquanto o provider de entrega real não
// existe, o passo 1 responde "indisponível" - dependência de deploy declarada.
export function LoginForm({ aoConcluir }: { aoConcluir?: () => void } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo =
    caminhoDeRedirecionamentoSeguro(
      searchParams.get("redirect") ?? searchParams.get("callbackUrl"),
    );
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const formCpf = useForm<CpfLoginInput>({
    resolver: zodResolver(cpfLoginSchema),
    defaultValues: { cpf: "" },
  });
  const formCodigo = useForm<OtpCodigoInput>({
    resolver: zodResolver(otpCodigoSchema),
    defaultValues: { codigo: "" },
  });

  function pedirCodigo(values: CpfLoginInput) {
    setServerError(null);
    startTransition(async () => {
      const r = await solicitarCodigoDeLoginAction(values);
      if (!r.ok) {
        setServerError(r.error);
        toast.error(r.error);
        return;
      }
      setChallengeId(r.data.challengeId);
      toast.success("Se houver conta, enviamos um código ao telefone cadastrado.");
    });
  }

  function entrar(values: OtpCodigoInput) {
    if (!challengeId) return;
    setServerError(null);
    startTransition(async () => {
      const r = await entrarComCodigoAction({ challengeId, codigo: values.codigo });
      if (!r.ok) {
        setServerError(r.error);
        toast.error(r.error);
        return;
      }
      toast.success("Login realizado");
      if (aoConcluir) return aoConcluir();
      router.refresh();
      router.push(redirectTo);
    });
  }

  if (!challengeId) {
    return (
      <Form {...formCpf}>
        <form onSubmit={formCpf.handleSubmit(pedirCodigo)} className="space-y-4">
          <FormField
            control={formCpf.control}
            name="cpf"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={ROTULO}>CPF</FormLabel>
                <FormControl>
                  <div className="relative">
                    <IdCard className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      className={cn(CAMPO, "tabular-nums")}
                      value={formatCpf(field.value ?? "")}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {serverError && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {serverError}
            </p>
          )}
          <BotaoDeGrade disabled={isPending}>
            {isPending ? "Enviando..." : "Enviar código"}
          </BotaoDeGrade>
        </form>
      </Form>
    );
  }

  return (
    <Form {...formCodigo}>
      <form onSubmit={formCodigo.handleSubmit(entrar)} className="space-y-4">
        <FormField
          control={formCodigo.control}
          name="codigo"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={ROTULO}>Código recebido</FormLabel>
              <FormControl>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={6}
                    className={cn(CAMPO, "tabular-nums tracking-[0.4em]")}
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {serverError}
          </p>
        )}
        <BotaoDeGrade disabled={isPending}>
          {isPending ? "Entrando..." : "Entrar na conta"}
        </BotaoDeGrade>
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground underline"
          onClick={() => { setChallengeId(null); setServerError(null); formCodigo.reset(); }}
        >
          Usar outro CPF
        </button>
      </form>
    </Form>
  );
}
