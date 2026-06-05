import { ASSET_STATUS_COLORS, ASSET_STATUS_LABELS, AssetStatus } from "@/types";
import { clsx } from "clsx";

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const dot: Record<AssetStatus, string> = {
    active: "bg-green-500",
    not_found: "bg-red-500",
    transferred: "bg-blue-500",
    repair: "bg-amber-500",
    decommissioned: "bg-gray-400",
  };

  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold",
      ASSET_STATUS_COLORS[status],
    )}>
      <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", dot[status])} />
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}

const BADGE_COLORS: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300",
  green: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  yellow: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
};

export function Badge({ children, color = "gray" }: { children: React.ReactNode; color?: string }) {
  return (
    <span className={clsx(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
      BADGE_COLORS[color] || BADGE_COLORS.gray,
    )}>
      {children}
    </span>
  );
}
