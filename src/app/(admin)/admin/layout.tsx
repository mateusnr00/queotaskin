import { requireAdmin } from "@/lib/auth-helpers";
import { AdminShell } from "@/components/admin/admin-shell";
import { getBrand } from "@/lib/brand";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bloqueia /admin/* para quem não é ADMIN. Segunda camada (a primeira é o proxy).
  const session = await requireAdmin();
  const marca = await getBrand();

  return (
    <AdminShell userName={session.user.name ?? "Admin"} marca={marca}>
      {children}
    </AdminShell>
  );
}
