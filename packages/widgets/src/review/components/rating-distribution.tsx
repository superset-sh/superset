import { Star } from "lucide-react";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface RatingDistributionProps {
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  totalCount: number;
  onFilterByRating?: (rating: number) => void;
  className?: string;
}

export function RatingDistribution({
  distribution,
  totalCount,
  onFilterByRating,
  className,
}: RatingDistributionProps) {
  const ratings = [5, 4, 3, 2, 1] as const;

  return (
    <div className={cn("space-y-2", className)}>
      {ratings.map((rating) => {
        const count = distribution[rating];
        const percentage = totalCount > 0 ? (count / totalCount) * 100 : 0;

        return (
          <button
            key={rating}
            type="button"
            disabled={!onFilterByRating}
            onClick={() => onFilterByRating?.(rating)}
            className={cn(
              "w-full flex items-center gap-2 group",
              onFilterByRating && "hover:bg-accent/50 rounded px-2 py-1 transition-colors"
            )}
          >
            <div className="flex items-center gap-1 w-12">
              <span className="text-sm font-medium">{rating}</span>
              <Star className="size-3 fill-yellow-400 text-yellow-400" />
            </div>

            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>

            <span className="text-sm text-muted-foreground w-8 text-right">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
