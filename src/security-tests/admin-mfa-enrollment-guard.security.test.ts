// REGRESSÃO (parte 2): os guards de autorização em volta do enrollment de MFA.
//
// Complementa admin-mfa-enrollment-route: o proxy libera /configurar-mfa no
// host admin; aqui fixamos que os GUARDS da rota continuam corretos e não
// reintroduzem o loop nem enfraquecem o gate de MFA das ações reais.
//
//  - requireAdmin (layout do painel): admin sem MFA -> /configurar-mfa.
//  - requireAdminSemTrocaDeSenha (a própria página): NUNCA gate por MFA, senão
//    a página redirecionaria para si mesma.
//  - getAdminParaEnrollment (as actions de enrollment): exige auth + role, mas
//    NÃO exige MFA ativa (é como se ativa).
//  - getAdminOrThrow (ações reais / step-up): continua exigindo MFA ativa.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const e = new Error("NEXT_REDIRECT") as Error & { digest: string; url: string };
    e.digest = "NEXT_REDIRECT";
    e.url = url;
    throw e;
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/server/services/admin/mfa", () => ({ mfaAtivo: vi.fn() }));
// auth-helpers importa este módulo no topo; mock evita pull de dependências
// pesadas e mantém o teste puro.
vi.mock("@/server/services/otp/sessao-participante", () => ({
  validarSessaoParticipante: vi.fn(),
  donoOuAdminPodeAcessar: vi.fn(),
  sessaoFoiRevogada: vi.fn(),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { mfaAtivo } from "@/server/services/admin/mfa";
import {
  requireAdmin,
  requireAdminSemTrocaDeSenha,
  getAdminParaEnrollment,
  getAdminOrThrow,
} from "@/lib/auth-helpers";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

const mAuth = vi.mocked(auth);
const mFind = vi.mocked(prisma.user.findUnique);
const mMfa = vi.mocked(mfaAtivo);

function sessao(user: unknown) {
  mAuth.mockResolvedValue((user ? { user } : null) as never);
}
function banco(fresh: unknown) {
  mFind.mockResolvedValue(fresh as never);
}
async function redirectDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    const err = e as { digest?: string; url?: string };
    if (err?.digest === "NEXT_REDIRECT") return err.url ?? null;
    throw e;
  }
}

const ADMIN = { id: "a1", role: "ADMIN", tenantId: null, mustChangePassword: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guards do enrollment de MFA (regressão)", () => {
  it("CASO 2: admin autenticado SEM MFA em rota admin protegida -> redirect /configurar-mfa", async () => {
    sessao({ id: "a1" });
    banco(ADMIN);
    mMfa.mockResolvedValue(false);
    expect(await redirectDe(requireAdmin)).toBe("/configurar-mfa");
  });

  it("CASO 4: admin com MFA ativa acessa /admin normalmente (sem redirect)", async () => {
    sessao({ id: "a1" });
    banco(ADMIN);
    mMfa.mockResolvedValue(true);
    const s = await requireAdmin();
    expect(s.user.role).toBe("ADMIN");
  });

  it("CASO 3: a página /configurar-mfa (requireAdminSemTrocaDeSenha) NÃO redireciona por MFA — sem isso, laço", async () => {
    sessao({ id: "a1" });
    banco(ADMIN);
    // Independe do estado de MFA: a página é acessível ao admin configurando.
    for (const ativa of [false, true]) {
      mMfa.mockResolvedValue(ativa);
      const s = await requireAdminSemTrocaDeSenha();
      expect(s.user.role).toBe("ADMIN");
    }
    // E o guard da página nem consulta mfaAtivo (não teria como mandar pra si).
    expect(mMfa).not.toHaveBeenCalled();
  });

  it("CASO 5: não autenticado -> /login na página e UnauthorizedError nas actions de enrollment", async () => {
    sessao(null);
    expect(await redirectDe(requireAdminSemTrocaDeSenha)).toBe("/login");
    sessao(null);
    await expect(getAdminParaEnrollment()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("CASO 6: participante comum não acessa enrollment (página -> '/', action -> Forbidden)", async () => {
    sessao({ id: "p1" });
    banco({ id: "p1", role: "PARTICIPANT", tenantId: null, mustChangePassword: false });
    expect(await redirectDe(requireAdminSemTrocaDeSenha)).toBe("/");
    sessao({ id: "p1" });
    banco({ id: "p1", role: "PARTICIPANT", tenantId: null, mustChangePassword: false });
    await expect(getAdminParaEnrollment()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("CASO 9: fail-closed — sem claim de sessão, a action de enrollment recusa (não abre por omissão)", async () => {
    sessao(null);
    await expect(getAdminParaEnrollment()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("CASO 10: enrollment é independente do gate de MFA das ações reais", async () => {
    // Mesmo estado (admin, MFA NÃO ativa):
    sessao({ id: "a1" });
    banco(ADMIN);
    mMfa.mockResolvedValue(false);
    // ...as ações reais / step-up continuam BLOQUEADAS (exigem MFA ativa)...
    await expect(getAdminOrThrow()).rejects.toBeInstanceOf(ForbiddenError);
    // ...mas o enrollment é permitido (é justamente o caminho de ativar MFA).
    sessao({ id: "a1" });
    banco(ADMIN);
    mMfa.mockResolvedValue(false);
    const s = await getAdminParaEnrollment();
    expect(s.user.role).toBe("ADMIN");
  });
});
