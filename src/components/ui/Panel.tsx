import { Icon, type IconName } from "./Icon";
import { SectionLabel } from "./SectionLabel";

const PANEL_ICONS: Record<string, IconName> = {
  Quellen: "file",
  Chat: "chat",
  Studio: "studio",
};

export function Panel({
  label,
  count,
  children,
  className = "",
  headerAction,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}) {
  return (
    <section
      className={`ki-panel flex min-h-0 flex-col overflow-hidden ${className}`}
    >
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-line/50 bg-panel/80 px-4 py-3">
        <SectionLabel count={count}>{label}</SectionLabel>
        {headerAction ? (
          headerAction
        ) : (
          <span className="ki-tile h-10 w-10">
            <Icon name={PANEL_ICONS[label] ?? "spark"} size={18} />
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  );
}
