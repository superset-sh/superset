import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { ReviewCard } from "../components/review-card";
import { useReviews, useVoteHelpful } from "../hooks";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import type { SortOrder } from "../types";

interface ReviewListProps {
  targetType: string;
  targetId: string;
  sortable?: boolean;
  filterable?: boolean;
  currentUserId?: string;
}

export function ReviewList({
  targetType,
  targetId,
  sortable = true,
  currentUserId,
}: ReviewListProps) {
  const [sort, setSort] = useState<SortOrder>("recent");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useReviews({
    targetType,
    targetId,
    page,
    limit: 10,
    sort,
  });

  const voteHelpful = useVoteHelpful();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No reviews yet. Be the first to review!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort Controls */}
      {sortable ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {data.items.length} of {data.total} reviews
          </p>

          <Select value={sort} onValueChange={(value) => value && setSort(value as SortOrder)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="helpful">Most Helpful</SelectItem>
              <SelectItem value="rating_high">Highest Rating</SelectItem>
              <SelectItem value="rating_low">Lowest Rating</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Review Cards */}
      <div className="space-y-4">
        {data.items.map((review: { id: string; rating: number; title: string; content: string; verifiedPurchase: boolean; helpfulCount: number; createdAt: Date | string; authorId: string }) => (
          <ReviewCard
            key={review.id}
            review={review}
            canEdit={currentUserId === review.authorId}
            onVoteHelpful={() => voteHelpful.mutate({ reviewId: review.id })}
          />
        ))}
      </div>

      {/* Pagination */}
      {data.hasMore ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data.hasMore}
          >
            Load More
          </Button>
        </div>
      ) : null}
    </div>
  );
}
