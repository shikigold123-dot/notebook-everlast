import { Icon } from "./Icon";

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidthClassName = "max-w-lg",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Tailwind max-width Klasse für den Modal-Körper, z. B. "max-w-2xl". */
  maxWidthClassName?: string;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-xs">
      <div
        className={`ki-panel ki-enter flex max-h-[90vh] w-full flex-col overflow-hidden bg-paper shadow-pop ${maxWidthClassName}`}
      >
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-line/50 bg-panel/80 px-5 py-3">
          <span className="label-caps text-ink">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="ki-tile ki-interactive h-10 w-10 cursor-pointer"
            aria-label="Schließen"
          >
            <Icon name="x" size={17} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
