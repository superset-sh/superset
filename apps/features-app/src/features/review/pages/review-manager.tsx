import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { RatingStars } from "@superbuilder/widgets/review";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, Eye, EyeOff, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { useAdminPendingReviews, useAdminUpdateStatus } from "../hooks";
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
          <div className="text-muted-foreground py-8 text-center">No pending reviews</div>
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
                  <TableCell className="max-w-xs truncate font-medium">{review.title}</TableCell>
                  <TableCell className="text-muted-foreground max-w-md truncate">
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
                  <TableCell className="text-muted-foreground text-sm">
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
                            <CheckCircle className="mr-2 size-4" />
                            Approve
                          </DropdownMenuItem>
                        )}
                        {review.status !== "hidden" && (
                          <DropdownMenuItem onClick={() => handleUpdateStatus(review.id, "hidden")}>
                            <EyeOff className="mr-2 size-4" />
                            Hide
                          </DropdownMenuItem>
                        )}
                        {review.status !== "pending" && (
                          <DropdownMenuItem
                            onClick={() => handleUpdateStatus(review.id, "pending")}
                          >
                            <Eye className="mr-2 size-4" />
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
