export default function StatusBadge({ status }: { status: "done" | "failed" }) {
  if (status === "failed") return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">Failed</span>;
  return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Formatted</span>;
}
