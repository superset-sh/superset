/**
 * Story Studio - Graph tRPC Hooks (nodes + edges)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useGraph(chapterId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.graph.byChapter.queryOptions({ chapterId }),
    enabled: !!chapterId,
  });
}

export function useCreateNode(chapterId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.graph.createNode.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.graph.byChapter.queryKey({ chapterId }),
        });
      },
    }),
  );
}

export function useUpdateNode(chapterId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.graph.updateNode.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.graph.byChapter.queryKey({ chapterId }),
        });
      },
    }),
  );
}

export function useDeleteNode(chapterId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.graph.deleteNode.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.graph.byChapter.queryKey({ chapterId }),
        });
      },
    }),
  );
}

export function useCreateEdge(chapterId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.graph.createEdge.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.graph.byChapter.queryKey({ chapterId }),
        });
      },
    }),
  );
}

export function useUpdateEdge(chapterId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.graph.updateEdge.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.graph.byChapter.queryKey({ chapterId }),
        });
      },
    }),
  );
}

export function useDeleteEdge(chapterId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.storyStudio.graph.deleteEdge.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.storyStudio.graph.byChapter.queryKey({ chapterId }),
        });
      },
    }),
  );
}

export function useUpdateNodePositions() {
  const trpc = useTRPC();
  return useMutation(trpc.storyStudio.graph.updateNodePositions.mutationOptions());
}

export function useNodeSummaries(chapterId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.storyStudio.graph.getNodeSummaries.queryOptions({ chapterId }),
    enabled: !!chapterId,
  });
}
