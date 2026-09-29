import { requirePageUser } from "@/lib/auth";
import SettingsAdmin from "./SettingsAdmin";

export default async function SettingsPage() {
  const me = await requirePageUser(["super_admin", "admin"]);
  return <SettingsAdmin canEditModel={me.role === "super_admin"} />;
}
