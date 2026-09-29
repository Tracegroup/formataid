import Sidebar from "@/components/Sidebar";
import { requirePageUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar user={{ name: user.name, email: user.email, role: user.role }} />
      <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
