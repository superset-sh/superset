import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { MoreVertical, Eye, EyeOff, CheckCircle } from "lucide-react";
import { RatingStars } from "../components/rating-stars";
import { useAdminPendingReviews, useAdminUpdateStatus } from "../hooks";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { ReviewStatus } from "../types";

export function ReviewManager() {
  const { data: reviews, isLoading } = useAdminPendingReviews();
  const updateStatus = useAdminUpdateStatus();

  const handleUpdateStatus = async (id: string, status: ReviewStatus) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast.success(`Review ${status === "approved" ? "approved" : "hidden"} successfully`);
    } catch (error: any) {
      toast.error(error.message || "Failed to update review status");
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Moderation</CardTitle>
      </CardHeader>
      <CardContent>
        {!reviews || reviews.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No pending reviews
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rating</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((review: any) => (
                <TableRow key={review.id}>
                  <TableCell>
                    <RatingStars rating={review.rating} size="sm" />
                  </TableCell>
                  <TableCell className="font-medium max-w-xs truncate">
                    {review.title}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {review.content}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        review.status === "approved"
                          ? "default"
                          : review.status === "hidden"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {review.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {review.status !== "approved" && (
                          <DropdownMenuItem
                            onClick={() => handleUpdateStatus(review.id, "approved")}
                          >
                            <CheckCircle className="size-4 mr-2" />
                            Approve
                          </DropdownMenuItem>
                        )}
                        {review.status !== "hidden" && (
                          <DropdownMenuItem
                            onClick={() => handleUpdateStatus(review.id, "hidden")}
                          >
                            <EyeOff className="size-4 mr-2" />
                            Hide
                          </DropdownMenuItem>
                        )}
                        {review.status !== "pending" && (
                          <DropdownMenuItem
                            onClick={() => handleUpdateStatus(review.id, "pending")}
                          >
                            <Eye className="size-4 mr-2" />
                            Mark Pending
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
