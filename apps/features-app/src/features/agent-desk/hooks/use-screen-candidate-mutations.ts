import { useTRPC } from "../../../lib/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useGenerateScreenCandidates() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.generateScreenCandidates.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }),
      });
    },
  });
}

export function useUpdateScreenCandidate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.updateScreenCandidate.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
    },
  });
}

export function useUpdateFlowEdge() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.updateFlowEdge.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
    },
  });
}

export function useAddFlowEdge() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.addFlowEdge.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
    },
  });
}

export function useDeleteFlowEdge() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.deleteFlowEdge.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
    },
  });
}
