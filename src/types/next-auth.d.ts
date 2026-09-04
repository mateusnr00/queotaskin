// Estende os tipos do NextAuth para incluir nossos campos custom:
// - role: papel no sistema (SUPER_ADMIN | ADMIN | AFFILIATE | PARTICIPANT)
// - tenantId: tenant ao qual o usuário pertence (null pra SUPER_ADMIN e
//   PARTICIPANT, definido pra ADMIN/AFFILIATE)
import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    tenantId?: string | null;
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      tenantId?: string | null;
      sessionVersion?: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    tenantId?: string | null;
    sessionVersion?: number;
  }
}
