import { clsx } from "clsx";
import { ReactNode, ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

const SPINNER = (
  <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white shadow-sm",
    secondary: "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-600",
    danger: "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm",
    ghost: "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white",
  };

  const sizes = {
    xs: "px-2.5 py-1 text-xs gap-1.5 rounded-lg",
    sm: "px-3 py-1.5 text-xs gap-1.5 rounded-xl",
    md: "px-4 py-2 text-sm gap-2 rounded-xl",
    lg: "px-5 py-2.5 text-sm gap-2 rounded-xl",
  };

  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? SPINNER : icon}
      {children}
    </button>
  );
}
