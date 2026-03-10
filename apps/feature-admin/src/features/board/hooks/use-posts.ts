/**
 * Post Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * 게시물 목록 조회
 */
export function usePosts(boardId: string, options?: { page?: number; limit?: number }) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.board.posts.queryOptions({ boardId, ...options }),
    enabled: !!boardId,
  });
}

/**
 * 게시물 상세 조회
 */
export function usePost(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.board.post.queryOptions({ id }),
    enabled: !!id,
  });
}

/**
 * 게시물 생성
 */
export function useCreatePost() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.board.createPost.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: trpc.board.posts.queryKey({ boardId: variables.boardId }) });
    },
  });
}

/**
 * 게시물 수정
 */
export function useUpdatePost() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.board.updatePost.mutationOptions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: trpc.board.post.queryKey({ id: data.id }) });
      queryClient.invalidateQueries({ queryKey: trpc.board.posts.queryKey({ boardId: data.boardId }) });
    },
  });
}

/**
 * 게시물 삭제
 */
export function useDeletePost() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.board.deletePost.mutationOptions(),
    onSuccess: () => {
      // 모든 게시물 목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ["board", "posts"] });
    },
  });
}
