import { Star } from "lucide-react";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface RatingStarsProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onChange?: (rating: number) => void;
  className?: string;
}

const sizeClasses = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
};

export function RatingStars({
  rating,
  maxRating = 5,
  size = "md",
  interactive = false,
  onChange,
  className,
}: RatingStarsProps) {
  const handleClick = (value: number) => {
    if (interactive && onChange) {
      onChange(value);
    }
  };

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: maxRating }, (_, i) => i + 1).map((value) => {
        const isFilled = value <= Math.floor(rating);
        const isPartial = value === Math.ceil(rating) && rating % 1 !== 0;

        return (
          <button
            key={value}
            type="button"
            disabled={!interactive}
            onClick={() => handleClick(value)}
            className={cn(
              sizeClasses[size],
              interactive && "cursor-pointer hover:scale-110 transition-transform",
              !interactive && "cursor-default"
            )}
          >
            <Star
              className={cn(
                "w-full h-full",
                isFilled && "fill-yellow-400 text-yellow-400",
                isPartial && "fill-yellow-400/50 text-yellow-400",
                !isFilled && !isPartial && "text-gray-300"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
