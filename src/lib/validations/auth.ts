// Schemas Zod para autenticação — usados em Server Actions E em formulários
// no cliente (via @hookform/resolvers/zod). Validação dupla: o cliente roda
// pra UX (mostra erro antes de submeter), e o servidor roda pra SEGURANÇA
// (nunca confiar no que veio do cliente).
//
// Decisão de produto:
// - Cadastro pede nome completo + CPF + celular. O CPF é digitado pelo
//   próprio usuário (real, validado por dígito verificador) e nunca mais
//   é exibido na UI depois do cadastro — fica só no banco pra alimentar
//   o PIX. A SyncPay rejeitava CPFs sintéticos do pool antigo, por isso
//   voltamos a coletar do usuário.
// - Login é PASSWORDLESS por nome + celular. CPF NÃO é digitado no login —
//   o celular é o identificador único, o nome é verificado por cima
//   (case-insensitive). Funciona como "login e senha" pro usuário.

import { z } from "zod";
import { isValidCpf, onlyDigits } from "@/lib/cpf";

// Nome completo: pelo menos 2 palavras, 2–120 chars no total.
const nameField = z
  .string()
  .min(2, "Nome muito curto")
  .max(120, "Nome muito longo")
  .trim()
  .refine(
    (v) => v.trim().split(/\s+/).length >= 2,
    "Informe nome e sobrenome"
  );

// Celular brasileiro: DDD (2) + 8 ou 9 dígitos. Aceita máscara — só os
// dígitos vão pro banco.
const phoneField = z
  .string()
  .transform(onlyDigits)
  .refine(
    (v) => v.length >= 10 && v.length <= 11,
    "Celular inválido (DDD + número)"
  );

export const loginSchema = z.object({
  name: nameField,
  phone: phoneField,
});
export type LoginInput = z.infer<typeof loginSchema>;

// Cadastro pede nome + CPF + celular. CPF é validado por dígito verificador;
// nunca é exibido na UI depois do cadastro.
export const registerSchema = z.object({
  name: nameField,
  cpf: z
    .string()
    .transform(onlyDigits)
    .refine(isValidCpf, "CPF inválido"),
  phone: phoneField,
});
export type RegisterInput = z.infer<typeof registerSchema>;

// Edição admin: continua aceitando CPF (campo legado), telefone e papel.
// CPF aqui é opcional — contas criadas após a migração pra login por
// nome+celular não terão CPF; o admin pode preencher se quiser.
export const userEditSchema = z.object({
  id: z.string().cuid(),
  name: z
    .string()
    .min(2, "Nome muito curto")
    .max(120, "Nome muito longo")
    .trim(),
  cpf: z
    .string()
    .transform(onlyDigits)
    .refine(
      (v) => v === "" || isValidCpf(v),
      "CPF inválido"
    ),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine(
      (v) => v === "" || (v.length >= 10 && v.length <= 11),
      "Telefone inválido (DDD + número)"
    ),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "AFFILIATE", "PARTICIPANT"]),
});
export type UserEditInput = z.infer<typeof userEditSchema>;
