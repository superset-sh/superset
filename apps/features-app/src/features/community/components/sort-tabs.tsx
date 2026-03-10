import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { BarChart3, Check, ChevronDown, Clock, Flame, Swords, TrendingUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

interface SortTabsProps {
  value: "hot" | "new" | "top" | "rising" | "controversial";
  onChange: (value: "hot" | "new" | "top" | "rising" | "controversial") => void;
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  onTimeFilterChange?: (value: "hour" | "day" | "week" | "month" | "year" | "all") => void;
}

const sortOptions = [
  { value: "hot", label: "Hot", icon: Flame },
  { value: "new", label: "New", icon: Clock },
  { value: "top", label: "Top", icon: TrendingUp },
  { value: "rising", label: "Rising", icon: BarChart3 },
  { value: "controversial", label: "Controversial", icon: Swords },
] as const;

const timeOptions = [
  { value: "hour", label: "1시간" },
  { value: "day", label: "오늘" },
  { value: "week", label: "이번 주" },
  { value: "month", label: "이번 달" },
  { value: "year", label: "올해" },
  { value: "all", label: "전체" },
] as const;

export function SortTabs({ value, onChange, timeFilter, onTimeFilterChange }: SortTabsProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {sortOptions.map((option) => {
          const Icon = option.icon;
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                isActive
                  ? "text-foreground bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="size-3.5" />
              {option.label}
              {isActive && (
                <motion.div
                  layoutId="community-sort-active-tab"
                  className="bg-foreground absolute right-0 bottom-0 left-0 h-0.5"
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 500, damping: 30 }
                  }
                />
              )}
            </button>
          );
        })}
      </div>

      {value === "top" && onTimeFilterChange && timeFilter && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-1">
                {timeOptions.find((t) => t.value === timeFilter)?.label}
                <ChevronDown className="text-muted-foreground size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-32">
            <DropdownMenuLabel>기간</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {timeOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => onTimeFilterChange(option.value)}
                className="gap-2"
              >
                <span className="flex-1">{option.label}</span>
                {timeFilter === option.value && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
