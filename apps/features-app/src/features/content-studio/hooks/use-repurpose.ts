import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

/**
 * 단일 포맷 리퍼포징 mutation
 */
export function useRepurpose(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const canvasKey = trpc.contentStudio.canvas.queryKey({ studioId });

  const convert = useMutation(
    trpc.contentStudio.repurpose.convert.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: canvasKey }),
    })
  );

  return { convert };
}

/**
 * 일괄 리퍼포징 mutation
 */
export function useRepurposeBatch(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const canvasKey = trpc.contentStudio.canvas.queryKey({ studioId });

  const convertBatch = useMutation(
    trpc.contentStudio.repurpose.convertBatch.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: canvasKey }),
    })
  );

  return { convertBatch };
}

/**
 * 파생 콘텐츠 목록 query
 */
export function useDerivedContents(contentId: string) {
  const trpc = useTRPC();

  return useQuery(
    trpc.contentStudio.repurpose.listDerived.queryOptions({ contentId })
  );
}
