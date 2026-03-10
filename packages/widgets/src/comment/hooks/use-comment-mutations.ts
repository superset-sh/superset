/**
 * Comment Mutation Hooks - tRPC 기반 댓글 생성/수정/삭제
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@superbuilder/features-client/trpc-client";
import type { CommentTargetType } from "../types";

interface CommentMutationContext {
  targetType: CommentTargetType;
  targetId: string;
}

/**
 * 댓글 생성
 */
export function useCreateComment({ targetType, targetId }: CommentMutationContext) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.comment.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.comment.list.queryKey({ targetType, targetId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.comment.count.queryKey({ targetType, targetId }),
      });
    },
  });
}

/**
 * 댓글 수정
 */
export function useUpdateComment({ targetType, targetId }: CommentMutationContext) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.comment.update.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.comment.list.queryKey({ targetType, targetId }),
      });
      // Also invalidate replies that may contain the updated comment
      queryClient.invalidateQueries({
        queryKey: trpc.comment.getReplies.queryKey({ parentId: variables.id }),
      });
    },
  });
}

/**
 * 댓글 삭제
 */
export function useDeleteComment({ targetType, targetId }: CommentMutationContext) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.comment.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.comment.list.queryKey({ targetType, targetId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.comment.count.queryKey({ targetType, targetId }),
      });
    },
  });
}
