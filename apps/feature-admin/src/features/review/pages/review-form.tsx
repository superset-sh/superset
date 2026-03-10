import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { RatingStars } from "../components/rating-stars";
import { useCreateReview } from "../hooks";
import { toast } from "sonner";

interface ReviewFormProps {
  targetType: string;
  targetId: string;
  onSuccess?: () => void;
}

export function ReviewForm({ targetType, targetId, onSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const createReview = useCreateReview();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    if (!title.trim() || !content.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      await createReview.mutateAsync({
        targetType,
        targetId,
        rating,
        title: title.trim(),
        content: content.trim(),
      });

      toast.success("Review submitted successfully!");

      // Reset form
      setRating(0);
      setTitle("");
      setContent("");

      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to submit review");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Write a Review</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rating */}
          <div className="space-y-2">
            <Label>Rating *</Label>
            <RatingStars
              rating={rating}
              size="lg"
              interactive
              onChange={setRating}
            />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Summarize your review"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
            <p className="text-xs text-muted-foreground">
              {title.length}/200 characters
            </p>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Review *</Label>
            <Textarea
              id="content"
              placeholder="Share your experience..."
              value={content}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
              rows={5}
              maxLength={2000}
              required
            />
            <p className="text-xs text-muted-foreground">
              {content.length}/2000 characters
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" disabled={createReview.isPending}>
              {createReview.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
