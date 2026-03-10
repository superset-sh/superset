import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Star } from "lucide-react";
import { RatingStars } from "../components/rating-stars";
import { RatingDistribution } from "../components/rating-distribution";
import { useReviewSummary } from "../hooks";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";

interface ReviewSummaryProps {
  targetType: string;
  targetId: string;
  compact?: boolean;
  onFilterByRating?: (rating: number) => void;
  className?: string;
}

export function ReviewSummary({
  targetType,
  targetId,
  compact = false,
  onFilterByRating,
  className,
}: ReviewSummaryProps) {
  const { data: summary, isLoading } = useReviewSummary(targetType, targetId);

  if (isLoading) {
    return compact ? (
      <div className="flex items-center gap-1">
        <Skeleton className="h-4 w-16" />
      </div>
    ) : (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.totalCount === 0) {
    return compact ? (
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Star className="size-4" />
        <span>No reviews yet</span>
      </div>
    ) : null;
  }

  // Compact mode for cards/lists
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <Star className="size-4 fill-yellow-400 text-yellow-400" />
        <span className="font-medium">{summary.averageRating.toFixed(1)}</span>
        <span className="text-muted-foreground">({summary.totalCount})</span>
      </div>
    );
  }

  // Full mode for detail pages
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="text-4xl font-bold">
            {summary.averageRating.toFixed(1)}
          </span>
          <div className="space-y-1">
            <RatingStars rating={summary.averageRating} size="md" />
            <p className="text-sm text-muted-foreground font-normal">
              {summary.totalCount} {summary.totalCount === 1 ? "review" : "reviews"}
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RatingDistribution
          distribution={summary.distribution}
          totalCount={summary.totalCount}
          onFilterByRating={onFilterByRating}
        />
      </CardContent>
    </Card>
  );
}
