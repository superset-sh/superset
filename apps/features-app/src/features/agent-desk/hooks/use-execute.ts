import { useTRPC } from "../../../lib/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCancelExecution() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.cancelExecution.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }),
      });
    },
  });
}
