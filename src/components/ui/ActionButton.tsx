import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline";
};

export function ActionButton({
  variant = "primary",
  className = "",
  ...props
}: Props) {
  const base =
    "label-caps cursor-pointer px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const variants = {
    primary:
      "border-[1.5px] border-ink bg-signal text-ink hover:bg-ink hover:text-signal",
    outline: "border-[1.5px] border-ink bg-paper text-ink hover:bg-ink hover:text-paper",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}
