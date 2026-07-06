import { SectionLabel } from "./SectionLabel";

export function Panel({
  label,
  count,
  children,
  className = "",
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col border-[1.5px] border-ink bg-paper ${className}`}
    >
      <header className="border-b-[1.5px] border-ink px-3 py-2">
        <SectionLabel count={count}>{label}</SectionLabel>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}
