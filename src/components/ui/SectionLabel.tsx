export function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  // children liegen direkt im Label-Element (kein Wrapper-Span),
  // damit getByText das Element mit der label-caps-Klasse findet.
  return (
    <span className="label-caps inline-flex items-baseline gap-2 bg-ink px-1.5 py-0.5 text-paper">
      {children}
      {count !== undefined && <span>[{count}]</span>}
    </span>
  );
}
