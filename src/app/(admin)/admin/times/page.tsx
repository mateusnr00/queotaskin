import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth-helpers";
import { isStorageConfigured } from "@/lib/storage";
import { prisma } from "@/lib/db";
import { listarTodosOsTimes } from "@/server/services/times";
import { GerenciadorDeTimes } from "@/components/admin/gerenciador-de-times";

export const metadata: Metadata = { title: "Times" };

// Os times para quem o participante torce.
//
// A lista nasceu em código e virou cadastro porque escudo é arquivo e time
// novo aparece o tempo todo na cena. Nada disso pode depender de deploy.
export default async function AdminTimesPage() {
  await requireAdmin();
  const times = await listarTodosOsTimes();

  // Quantas pessoas torcem por cada time. É o número que decide se um time
  // pode ser apagado ou só desativado, e mostrá-lo evita a tentativa frustrada.
  const contagem = await prisma.user.groupBy({
    by: ["favoriteTeamId"],
    where: { favoriteTeamId: { not: null } },
    _count: { _all: true },
  });
  const torcedores = Object.fromEntries(
    contagem.map((c) => [c.favoriteTeamId!, c._count._all]),
  );

  return (
    <GerenciadorDeTimes
      times={times}
      torcedores={torcedores}
      storageLigado={isStorageConfigured()}
    />
  );
}
