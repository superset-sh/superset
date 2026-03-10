import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTRPC } from "@superbuilder/features-client/trpc-client";
import { authenticatedAtom } from "@superbuilder/features-client/core/auth";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface BookmarkButtonProps {
  targetType: string;
  targetId: string;
  className?: string;
  size?: "sm" | "default" | "lg" | "icon";
}

export function BookmarkButton({ targetType, targetId, className, size = "icon" }: BookmarkButtonProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isAuthenticated = useAtomValue(authenticatedAtom);

  const statusQuery = useQuery({
    ...trpc.bookmark.isBookmarked.queryOptions({ targetType, targetId }),
    enabled: !!isAuthenticated,
  });

  const toggleMutation = useMutation({
    ...trpc.bookmark.toggle.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.bookmark.isBookmarked.queryKey({ targetType, targetId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.bookmark.myList.queryKey(),
      });
    },
  });

  const isBookmarked = statusQuery.data === true;

  const handleToggle = () => {
    if (!isAuthenticated) return;
    toggleMutation.mutate({ targetType, targetId });
  };

  return (
    <Button
      variant="ghost"
      size={size}
      className={cn(
        isBookmarked && "text-primary",
        className,
      )}
      onClick={handleToggle}
      disabled={!isAuthenticated || toggleMutation.isPending}
    >
      {isBookmarked ? (
        <BookmarkCheck className="size-5 fill-current" />
      ) : (
        <Bookmark className="size-5" />
      )}
    </Button>
  );
}
