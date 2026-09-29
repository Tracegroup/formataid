import PageHeader from "@/components/PageHeader";
import HistoryList from "@/components/HistoryList";
import { isAdmin, requirePageUser } from "@/lib/auth";

export default async function HistoryPage() {
  const user = await requirePageUser();
  return (
    <>
      <PageHeader title="History" description="Reports you have formatted." />
      <HistoryList canSeeAll={isAdmin(user)} />
    </>
  );
}
