import { Check, ChevronDown, Flame, Clock, TrendingUp, BarChart3, Swords } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";

interface SortDropdownProps {
  value: "hot" | "new" | "top" | "rising" | "controversial";
  onChange: (value: "hot" | "new" | "top" | "rising" | "controversial") => void;
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  onTimeFilterChange?: (value: "hour" | "day" | "week" | "month" | "year" | "all") => void;
}

const sortOptions = [
  { value: "hot", label: "인기", icon: Flame },
  { value: "new", label: "최신", icon: Clock },
  { value: "top", label: "추천", icon: TrendingUp },
  { value: "rising", label: "급상승", icon: BarChart3 },
  { value: "controversial", label: "논쟁", icon: Swords },
] as const;

const timeOptions = [
  { value: "hour", label: "1시간" },
  { value: "day", label: "오늘" },
  { value: "week", label: "이번 주" },
  { value: "month", label: "이번 달" },
  { value: "year", label: "올해" },
  { value: "all", label: "전체" },
] as const;

export function SortDropdown({ value, onChange, timeFilter, onTimeFilterChange }: SortDropdownProps) {
  const current = sortOptions.find((opt) => opt.value === value);
  const CurrentIcon = current?.icon ?? Flame;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <CurrentIcon className="size-4" />
            {current?.label}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        } />
        <DropdownMenuContent align="start" className="w-40">
          {sortOptions.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => onChange(option.value)}
                className="gap-2"
              >
                <Icon className="size-4" />
                <span className="flex-1">{option.label}</span>
                {value === option.value && <Check className="size-4" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Time Filter (for Top sort) */}
      {value === "top" && onTimeFilterChange && timeFilter && (
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="ghost" size="sm" className="gap-1">
              {timeOptions.find((t) => t.value === timeFilter)?.label}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          } />
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
