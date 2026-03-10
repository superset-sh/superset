/**
 * Comment Query Hooks - tRPC 기반 댓글 조회
 */
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@superbuilder/features-client/trpc-client";
import type { CommentTargetType } from "../types";

/**
 * 최상위 댓글 목록 조회
 */
export function useComments(
  targetType: CommentTargetType,
  targetId: string,
  options?: { page?: number; limit?: number },
) {
  const trpc = useTRPC();
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;

  return useQuery(
    trpc.comment.list.queryOptions({
      targetType,
      targetId,
      page,
      limit,
    }),
  );
}

/**
 * 대댓글 목록 조회
 */
export function useCommentReplies(
  parentId: string | null,
  options?: { page?: number; limit?: number; enabled?: boolean },
) {
  const trpc = useTRPC();
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;

  return useQuery({
    ...trpc.comment.getReplies.queryOptions({
      parentId: parentId ?? "",
      page,
      limit,
    }),
    enabled: !!parentId && (options?.enabled ?? true),
  });
}

/**
 * 댓글 개수 조회
 */
export function useCommentCount(
  targetType: CommentTargetType,
  targetId: string,
) {
  const trpc = useTRPC();

  return useQuery(
    trpc.comment.count.queryOptions({ targetType, targetId }),
  );
}
