// Autenticacao de participante por CPF + NOME COMPLETO (sem senha).
//
// Decisao de produto: o site publico prioriza conversao. A conta do
// participante so guarda os proprios titulos, entao a barreira e CPF (o
// identificador que a pessoa sabe de cor) + nome completo (conferido por
// cima). NAO ha senha, OTP, SMS ou e-mail no caminho normal.
//
// CPF + nome NAO sao segredo forte (semipublicos no Brasil). Por isso este
// caminho mantem o freio anti-abuso: teto por CPF e por IP, chaves em HMAC
// (nunca o CPF puro), FAIL-CLOSED. E amarrado ao tenant do host: nunca
// autentica uma conta de OUTRO tenant.
import { prisma } from "@/lib/db";
import { chaveDeAuth, limpar, permitido, registrar } from "@/server/services/otp/rate-limit";
import { tenantIdDoHost } from "@/lib/tenant";

/// Normaliza um nome completo para comparacao deterministica e amigavel:
/// tira espacos das pontas, colapsa espacos repetidos e ignora caixa.
///
/// "  João   da  Silva " e "JOÃO DA SILVA" batem no mesmo nome. Acentos sao
/// PRESERVADOS de proposito (joão != joao): remover acento casaria nomes
/// diferentes e viraria uma correspondencia mais fraca que "nome completo".
/// NAO ha fuzzy/contains/primeiro-nome: e igualdade do nome inteiro.
export function normalizarNomeCompleto(nome: string): string {
  return nome.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export interface IdentidadeParticipante {
  id: string;
  tenantId: string | null;
}

/// Login: CPF + nome completo. Rate-limit por HMAC(CPF) + IP (fail-closed).
/// Resposta neutra: CPF inexistente e nome errado sao indistinguiveis (nao
/// revela se a conta existe). Amarrado ao tenant do host.
export async function autenticarParticipantePorNome(entrada: {
  cpf: string;
  nome: string;
  ip?: string | null;
  host?: string | null;
}): Promise<IdentidadeParticipante | null> {
  const chaves = [chaveDeAuth("PARTICIPANT_NAME_ATTEMPT", "cpf", entrada.cpf)];
  if (entrada.ip) chaves.push(chaveDeAuth("PARTICIPANT_NAME_ATTEMPT", "ip", entrada.ip));
  if (!(await permitido(chaves)).permitido) return null;

  const user = await prisma.user.findUnique({
    where: { cpf: entrada.cpf },
    select: { id: true, tenantId: true, name: true },
  });

  // Confere sempre um nome, inclusive quando a conta nao existe (alvo
  // sentinela): mantem o caminho parecido e nao abre oraculo de existencia por
  // CPF. Comparacao deterministica de nome completo (ver normalizarNomeCompleto).
  const alvo = user?.name ?? "sentinela sem conta";
  const nomeConfere =
    normalizarNomeCompleto(alvo) === normalizarNomeCompleto(entrada.nome);

  if (!user || !nomeConfere) {
    await registrar("PARTICIPANT_NAME_ATTEMPT", chaves);
    return null;
  }

  // Amarra ao tenant do host: se o host resolve um tenant e a conta pertence a
  // OUTRO tenant, recusa (nunca lookup/login cross-tenant). Participante global
  // (tenantId=null) e dev/preview (host sem tenant cadastrado) passam.
  const tenantDoHost = await tenantIdDoHost(entrada.host);
  if (tenantDoHost && user.tenantId && user.tenantId !== tenantDoHost) {
    await registrar("PARTICIPANT_NAME_ATTEMPT", chaves);
    return null;
  }

  await limpar(chaves);
  return { id: user.id, tenantId: user.tenantId };
}
