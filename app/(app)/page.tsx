import FormatReport from "@/components/FormatReport";
import PageHeader from "@/components/PageHeader";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Format a report" description="Upload a drafted report and download it formatted to TCG report standards." />
      <FormatReport />
    </>
  );
}
