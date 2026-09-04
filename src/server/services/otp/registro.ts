// Cadastro seguro: verifica o telefone ANTES de criar a conta. Nenhum User
// autenticavel nasce sem prova do telefone (REG-3). Um cadastro nunca altera
// uma conta existente por CPF (REG-1 / anti-hijack): se o CPF ou o telefone ja
// pertencem a alguem, o fluxo responde de forma neutra e nao toca a conta.
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { destinoCanonico } from "@/lib/auth/cripto";
import { chaveDeAuth, limpar, permitido, registrar } from "@/server/services/otp/rate-limit";
import { criarDesafio, verificarDesafio } from "@/server/services/otp/otp-service";
import { vincularIndicacao } from "@/server/services/afiliados";
import type { OtpDeliveryProvider } from "@/server/services/otp/provider";

const CADASTRO_EXPIRA_MS = 15 * 60 * 1000;

export interface PedidoDeCadastro {
  name: string;
  cpf: string; // digitos, ja validado por quem chama
  phone: string; // digitos
  phoneCountry: string;
  tenantId?: string | null;
  codigoDeIndicacao?: string | null;
  ip?: string | null;
}

export interface RespostaDeCadastro {
  challengeId: string;
  enviado: true;
}

/// Passo 1: recebe os dados, freia, e (se possivel) dispara OTP ao telefone.
/// Resposta SEMPRE neutra. Se cpf/telefone ja existem, cria um desafio
/// chamariz: nao entrega e a conta existente nao e tocada (anti-hijack).
export async function solicitarCadastro(
  pedido: PedidoDeCadastro,
  provider: OtpDeliveryProvider,
): Promise<RespostaDeCadastro | { bloqueado: true }> {
  const chaves = [
    chaveDeAuth("REGISTER_REQUEST", "cpf", pedido.cpf),
    chaveDeAuth("REGISTER_REQUEST", "phone", destinoCanonico(pedido.phoneCountry, pedido.phone)),
  ];
  if (pedido.ip) chaves.push(chaveDeAuth("REGISTER_REQUEST", "ip", pedido.ip));

  if (!(await permitido(chaves)).permitido) return { bloqueado: true };
  await registrar("REGISTER_REQUEST", chaves);

  // Ja existe conta com este CPF ou telefone? Nao revela e nao toca nada.
  const conflito = await prisma.user.findFirst({
    where: { OR: [{ cpf: pedido.cpf }, { phone: pedido.phone }] },
    select: { id: true },
  });

  if (conflito) {
    // Chamariz: forma identica, sem entrega, sem pendente aproveitavel.
    const decoy = await prisma.authChallenge.create({
      data: {
        purpose: "REGISTER_PHONE",
        destinationHash: `decoy:${crypto.randomUUID()}`,
        codeHash: `decoy:${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + CADASTRO_EXPIRA_MS),
      },
      select: { id: true },
    });
    return { challengeId: decoy.id, enviado: true };
  }

  const { challengeId } = await criarDesafio(
    {
      purpose: "REGISTER_PHONE",
      tenantId: pedido.tenantId ?? null,
      destino: { phoneCountry: pedido.phoneCountry, phoneDigits: pedido.phone },
    },
    provider,
  );

  await prisma.pendingRegistration.create({
    data: {
      challengeId,
      name: pedido.name,
      cpf: pedido.cpf,
      phone: pedido.phone,
      phoneCountry: pedido.phoneCountry,
      tenantId: pedido.tenantId ?? null,
      codigoDeIndicacao: pedido.codigoDeIndicacao ?? null,
      expiresAt: new Date(Date.now() + CADASTRO_EXPIRA_MS),
    },
  });

  return { challengeId, enviado: true };
}

export type ResultadoDaConclusao =
  | { ok: true; userId: string }
  | { ok: false; motivo: "CODIGO_INVALIDO" | "PENDENTE_INEXISTENTE" | "JA_EXISTE" | "BLOQUEADO" };

/// Passo 2: valida o OTP de REGISTER_PHONE e cria o User atomicamente, com
/// phoneVerifiedAt setado. A unicidade global de cpf/phone resolve a
/// concorrencia: 20 conclusoes simultaneas -> 1 cria, as outras batem no
/// P2002 (REG / §10 / §43). OTP de registro ja consumido nao cria 2a conta.
export async function concluirCadastro(entrada: {
  challengeId: string;
  codigo: string;
  ip?: string | null;
}): Promise<ResultadoDaConclusao> {
  const chaves = [chaveDeAuth("REGISTER_VERIFY", "challenge", entrada.challengeId)];
  if (entrada.ip) chaves.push(chaveDeAuth("REGISTER_VERIFY", "ip", entrada.ip));
  if (!(await permitido(chaves)).permitido) return { ok: false, motivo: "BLOQUEADO" };

  const pendente = await prisma.pendingRegistration.findUnique({
    where: { challengeId: entrada.challengeId },
  });
  if (!pendente || pendente.consumedAt) {
    await registrar("REGISTER_VERIFY", chaves);
    return { ok: false, motivo: "PENDENTE_INEXISTENTE" };
  }

  const verif = await verificarDesafio({
    challengeId: entrada.challengeId,
    codigo: entrada.codigo,
    purpose: "REGISTER_PHONE",
    tenantId: pendente.tenantId,
    userId: null,
  });
  if (verif.resultado !== "VERIFICADO") {
    await registrar("REGISTER_VERIFY", chaves);
    return { ok: false, motivo: "CODIGO_INVALIDO" };
  }

  // Reivindica o pendente (compare-and-set): so a 1a conclusao cria a conta.
  const claim = await prisma.pendingRegistration.updateMany({
    where: { id: pendente.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claim.count === 0) return { ok: false, motivo: "JA_EXISTE" };

  try {
    const user = await prisma.user.create({
      data: {
        name: pendente.name,
        cpf: pendente.cpf,
        phone: pendente.phone,
        phoneCountry: pendente.phoneCountry,
        phoneVerifiedAt: new Date(), // telefone provado agora
        role: "PARTICIPANT",
        tenantId: pendente.tenantId,
      },
      select: { id: true },
    });
    // Vinculo de indicacao: nunca derruba o cadastro (codigo invalido so nao
    // vincula). So agora, com a conta ja existindo.
    if (pendente.codigoDeIndicacao) {
      await vincularIndicacao(user.id, pendente.codigoDeIndicacao).catch(() => null);
    }
    await limpar(chaves);
    return { ok: true, userId: user.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, motivo: "JA_EXISTE" }; // cpf/phone tomado no meio
    }
    throw err;
  }
}
