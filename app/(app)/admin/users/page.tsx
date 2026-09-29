import { requirePageUser } from "@/lib/auth";
import UsersAdmin from "./UsersAdmin";

export default async function UsersPage() {
  const me = await requirePageUser(["super_admin"]);
  return <UsersAdmin meId={me.id} />;
}
