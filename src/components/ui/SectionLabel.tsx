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
    <span className="label-caps ki-pill inline-flex min-h-8 items-center gap-2 px-3 py-1 text-muted">
      {children}
      {count !== undefined && <span>[{count}]</span>}
    </span>
  );
}
