import { ThumbsUp, Flag, MoreVertical } from "lucide-react";
import { Card, CardContent } from "@superbuilder/feature-ui/shadcn/card";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { RatingStars } from "./rating-stars";
import { formatDistanceToNow } from "date-fns";

interface ReviewCardProps {
  review: {
    id: string;
    rating: number;
    title: string;
    content: string;
    verifiedPurchase: boolean;
    helpfulCount: number;
    createdAt: Date | string;
    authorId: string;
  };
  isHelpful?: boolean;
  canEdit?: boolean;
  onVoteHelpful?: () => void;
  onReport?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ReviewCard({
  review,
  isHelpful,
  canEdit,
  onVoteHelpful,
  onReport,
  onEdit,
  onDelete,
}: ReviewCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RatingStars rating={review.rating} size="sm" />
                {review.verifiedPurchase && (
                  <Badge variant="secondary" className="text-xs">
                    Verified Purchase
                  </Badge>
                )}
              </div>
              <h4 className="font-semibold">{review.title}</h4>
            </div>

            {(canEdit || onReport) && (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      Edit review
                    </DropdownMenuItem>
                  )}
                  {canEdit && onDelete && (
                    <DropdownMenuItem onClick={onDelete} className="text-destructive">
                      Delete review
                    </DropdownMenuItem>
                  )}
                  {onReport && (
                    <DropdownMenuItem onClick={onReport}>
                      <Flag className="size-4 mr-2" />
                      Report review
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Content */}
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {review.content}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
            </span>

            {onVoteHelpful && (
              <Button
                variant={isHelpful ? "default" : "ghost"}
                size="sm"
                onClick={onVoteHelpful}
                className="gap-1"
              >
                <ThumbsUp className="size-3" />
                Helpful ({review.helpfulCount})
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
