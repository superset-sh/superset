import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { cn } from "@superbuilder/feature-ui/lib/utils";

const KARMA_LEVELS = [
  { min: 5000, label: "Leader", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 dark:bg-yellow-500/20" },
  { min: 2000, label: "Guide", className: "bg-purple-500/10 text-purple-700 dark:text-purple-400 dark:bg-purple-500/20" },
  { min: 500, label: "Helper", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 dark:bg-blue-500/20" },
  { min: 100, label: "Contributor", className: "bg-green-500/10 text-green-700 dark:text-green-400 dark:bg-green-500/20" },
] as const;

function getKarmaLevel(karma: number) {
  return KARMA_LEVELS.find((level) => karma >= level.min) ?? null;
}

interface KarmaBadgeProps {
  karma: number;
  className?: string;
}

export function KarmaBadge({ karma, className }: KarmaBadgeProps) {
  const level = getKarmaLevel(karma);
  const formatted = karma.toLocaleString();

  if (!level) {
    return (
      <span className={cn("text-muted-foreground text-xs", className)}>
        {"\uD83C\uDFC5"} {formatted}
      </span>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("gap-0.5 border-transparent px-1.5 py-0 text-[10px]", level.className, className)}
    >
      {"\uD83C\uDFC5"} {formatted}
    </Badge>
  );
}
