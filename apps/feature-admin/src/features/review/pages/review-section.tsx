import { ReviewSummary } from "./review-summary";
import { ReviewList } from "./review-list";
import { ReviewForm } from "./review-form";

interface ReviewSectionProps {
  targetType: string;
  targetId: string;
  showForm?: boolean;
  currentUserId?: string;
  className?: string;
}

/**
 * Complete review section with summary, form (optional), and list
 *
 * @example
 * <ReviewSection
 *   targetType="board_post"
 *   targetId={post.id}
 *   showForm={!!user}
 *   currentUserId={user?.id}
 * />
 */
export function ReviewSection({
  targetType,
  targetId,
  showForm = false,
  currentUserId,
  className,
}: ReviewSectionProps) {
  return (
    <div className={`space-y-8 ${className || ""}`}>
      {/* Rating Summary */}
      <ReviewSummary targetType={targetType} targetId={targetId} />

      {/* Review Form (if logged in) */}
      {showForm && (
        <ReviewForm targetType={targetType} targetId={targetId} />
      )}

      {/* Review List */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Reviews</h3>
        <ReviewList
          targetType={targetType}
          targetId={targetId}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
