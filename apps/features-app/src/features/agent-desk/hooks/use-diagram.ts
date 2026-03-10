import { useTRPC } from "../../../lib/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useDiagrams(sessionId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.agentDesk.getDiagrams.queryOptions({ sessionId }));
}

export function useGenerateDiagrams() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.generateDiagrams.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getDiagrams.queryKey({ sessionId: variables.sessionId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }),
      });
    },
  });
}

export function useGenerateFromAnalysis() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.generateFromAnalysis.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getDiagrams.queryKey({ sessionId: variables.sessionId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }),
      });
    },
  });
}
