import { useTRPC } from "../../../lib/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { lastTokenUsageAtom } from "../store/agent-settings.atoms";

export function useGenerateScreens() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setLastTokenUsage = useSetAtom(lastTokenUsageAtom);

  return useMutation({
    ...trpc.agentDesk.generateScreensFromAnalysis.mutationOptions(),
    // mutationKey 제거 — 캐시 공유로 인한 stale isPending 방지
    onSuccess: (data, variables) => {
      if (data?.usage) {
        setLastTokenUsage(data.usage);
      }
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }),
      });
    },
  });
}
