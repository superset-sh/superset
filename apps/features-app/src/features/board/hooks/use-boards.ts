/**
 * Board Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery } from "@tanstack/react-query";

/**
 * 게시판 목록 조회
 */
export function useBoards(includeInactive = false) {
  const trpc = useTRPC();
  return useQuery(trpc.board.list.queryOptions({ includeInactive }));
}

/**
 * Slug로 게시판 조회
 */
export function useBoardBySlug(slug: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.board.bySlug.queryOptions({ slug }),
    enabled: !!slug,
  });
}

/**
 * ID로 게시판 조회
 */
export function useBoardById(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.board.byId.queryOptions({ id }),
    enabled: !!id,
  });
}
