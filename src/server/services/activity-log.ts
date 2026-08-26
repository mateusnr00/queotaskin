// Escrita do registro de atividade.
//
// Uma função só, chamada explicitamente de cada ponto que importa. A
// alternativa automática (extension do Prisma logando todo write) foi
// descartada no design: naquele nível não existe sessão, então o registro não
// saberia QUEM fez, e ele registraria operações de banco em vez de intenções,
// então publicar um sorteio de mil números viraria mil linhas iguais.
//
// A regra que sustenta tudo: esta função NUNCA lança. Ela é chamada de dentro
// de confirmação de pagamento, de criação de reserva e de promoção de conta.
// Derrubar qualquer um deles porque o log falhou trocaria um problema pequeno
// por um grande.

import { headers } from "next/headers";
import type { Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { sanitizarDetalhes } from "@/lib/activity-log-detalhes";
import { ipDaRequisicao } from "@/server/services/login-throttle";
import type { AcaoDeLog, TipoDeAlvo } from "@/lib/activity-log-actions";

type Origem = "PAINEL" | "SISTEMA" | "PUBLICO";

export interface EntradaDeLog {
  acao: AcaoDeLog;
  tenantId?: string | null;
  alvo?: { tipo: TipoDeAlvo; id: string; rotulo?: string | null };
  detalhes?: Record<string, unknown>;
  /**
   * Onde a ação nasceu. Padrão PAINEL. Independe de quem agiu: a troca do
   * link da Steam tem ator de sessão e origem PUBLICO ao mesmo tempo.
   */
  origem?: Origem;
  /**
   * Só quando NÃO há sessão para ler: webhook de gateway e cron. Com ator
   * informado, a sessão nem é consultada, o que também evita uma ida ao banco
   * dentro do caminho de confirmação de pagamento.
   */
  ator?: { nome: string };
}

interface AtorResolvido {
  id: string | null;
  nome: string;
  papel: Role | null;
  email: string | null;
}

/**
 * Import tardio do `auth`, e isso não é preciosismo.
 *
 * O provider de senha em src/auth.ts chama registrarLog para gravar a entrada
 * no painel. Um import estático aqui fecharia o ciclo auth -> activity-log ->
 * auth, e módulo em ciclo pode ser lido meio inicializado, dependendo de como
 * o bundler resolve a ordem. O import dentro da função só acontece quando
 * alguém realmente precisa da sessão, e nesse ponto tudo já subiu.
 *
 * Quem chama de dentro do auth.ts sempre informa o ator, então nem passa por
 * aqui.
 */
async function atorDaSessao(): Promise<AtorResolvido> {
  const { auth } = await import("@/auth");
  const session = await auth();
  const u = session?.user;
  if (!u?.id) {
    return { id: null, nome: "Desconhecido", papel: null, email: null };
  }
  return {
    id: u.id,
    nome: u.name ?? "Sem nome",
    papel: (u.role as Role | undefined) ?? null,
    email: u.email ?? null,
  };
}

/**
 * IP de quem chamou, quando dá para saber.
 *
 * `headers()` só existe dentro do escopo de uma requisição; no cron e em
 * script ele lança. O catch devolve nulo em vez de deixar o erro subir: o
 * registro entra sem IP, que é bem melhor do que não entrar.
 */
async function ipAtual(): Promise<string | null> {
  try {
    return ipDaRequisicao(await headers());
  } catch {
    return null;
  }
}

export async function registrarLog(entrada: EntradaDeLog): Promise<void> {
  try {
    const ator: AtorResolvido = entrada.ator
      ? { id: null, nome: entrada.ator.nome, papel: null, email: null }
      : await atorDaSessao();

    await prisma.activityLog.create({
      data: {
        tenantId: entrada.tenantId ?? null,
        origem: entrada.origem ?? "PAINEL",
        actorId: ator.id,
        actorName: ator.nome,
        actorRole: ator.papel,
        actorEmail: ator.email,
        acao: entrada.acao,
        alvoTipo: entrada.alvo?.tipo ?? null,
        alvoId: entrada.alvo?.id ?? null,
        alvoRotulo: entrada.alvo?.rotulo ?? null,
        detalhes: entrada.detalhes
          ? (sanitizarDetalhes(entrada.detalhes) as Prisma.InputJsonValue)
          : undefined,
        ip: await ipAtual(),
      },
    });
  } catch (err) {
    console.error("[activity-log] falha ao registrar", entrada.acao, err);
  }
}
