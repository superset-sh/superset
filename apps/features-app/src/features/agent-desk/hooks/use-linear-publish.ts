import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

export function usePreviewLinearIssues() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.previewLinearIssues.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getLinearPublishStatus.queryKey(),
      });
    },
  });
}

export function useCreateLinearIssues() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.createLinearIssues.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getLinearPublishStatus.queryKey(),
      });
    },
  });
}

export function useLinearPublishStatus(
  sessionId: string | undefined,
  publishJobId: string | undefined,
) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.agentDesk.getLinearPublishStatus.queryOptions({
      sessionId: sessionId ?? "",
      publishJobId: publishJobId ?? "",
    }),
    enabled: !!sessionId && !!publishJobId,
  });
}
