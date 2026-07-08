import { getApi } from "@/lib/api/server";
import UsersTable from "@/features/auth/components/UsersTable";
import type { ManagedUser } from "@/features/auth/types";

export default async function AdminUsersPage() {
  const api = await getApi();
  const resp = await api.users.list({ size: 200 });
  // GAP: `UserRead` does NOT carry photoUrl. Emitting `null` — the
  // UsersTable renders avatars from initials when photoUrl is missing.
  const users: ManagedUser[] = resp.items.map((u) => ({
    uid: u.id,
    email: u.email ?? null,
    displayName: u.displayName,
    role: u.role,
    linkedId: u.linkedId ?? "",
    slug: u.slug ?? null,
    isActive: u.isActive,
    photoUrl: null,
  }));
  return <UsersTable initialUsers={users} />;
}
