/**
 * Task Priority Icon - 우선순위별 바 아이콘
 */
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {
  priority: number;
  className?: string;
  size?: number;
}

export function TaskPriorityIcon({ priority, className, size = 16 }: Props) {
  if (priority === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        title="None"
      >
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          <line
            x1="4"
            y1="8"
            x2="12"
            y2="8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[3]!;

  // Urgent: special icon — filled bars + exclamation mark
  if (priority === 1) {
    return (
      <span
        className={cn("inline-flex items-center justify-center shrink-0", className)}
        style={{ width: size, height: size }}
        title={config.label}
      >
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={1 + i * 3.5}
              y={12 - (i + 1) * 3}
              width="2.5"
              height={(i + 1) * 3}
              rx="0.5"
              className="text-red-500"
              fill="currentColor"
            />
          ))}
          <line
            x1="13"
            y1="3"
            x2="13"
            y2="9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-red-500"
          />
          <circle cx="13" cy="12" r="1" className="text-red-500" fill="currentColor" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
      title={config.label}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={3 + i * 4}
            y={12 - (i + 1) * 3}
            width="3"
            height={(i + 1) * 3}
            rx="0.5"
            className={cn(
              i < config.filledBars ? config.colorClass : "text-muted-foreground/20",
            )}
            fill="currentColor"
          />
        ))}
      </svg>
    </span>
  );
}

/* Constants */

interface PriorityConfig {
  label: string;
  colorClass: string;
  filledBars: number;
}

const PRIORITY_CONFIG: Record<number, PriorityConfig> = {
  1: { label: "Urgent", colorClass: "text-red-500", filledBars: 3 },
  2: { label: "High", colorClass: "text-orange-500", filledBars: 3 },
  3: { label: "Normal", colorClass: "text-muted-foreground", filledBars: 2 },
  4: { label: "Low", colorClass: "text-blue-400", filledBars: 1 },
};
