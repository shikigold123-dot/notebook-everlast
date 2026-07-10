import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  loading?: boolean;
};

export function ActionButton({
  variant = "primary",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: Props) {
  const base =
    "label-caps ki-interactive inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:saturate-50";
  const variants = {
    primary: "ki-cta border-[1.5px] border-signal bg-signal",
    outline: "ki-pill border-ink/30 text-ink hover:bg-panel-soft",
    ghost: "border border-line bg-transparent text-ink hover:bg-panel-soft",
    danger:
      "border-[1.5px] border-line bg-transparent text-danger hover:border-danger hover:bg-danger hover:text-danger-ink",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
