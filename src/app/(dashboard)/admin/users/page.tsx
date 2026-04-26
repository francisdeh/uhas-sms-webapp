import { listUsersAction } from "@/features/auth/actions/manage-users";
import UsersTable from "@/features/auth/components/UsersTable";

export default async function AdminUsersPage() {
  const users = await listUsersAction();
  return <UsersTable initialUsers={users} />;
}
