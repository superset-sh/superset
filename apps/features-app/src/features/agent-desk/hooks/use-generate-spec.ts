import { useTRPC } from "../../../lib/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { toast } from "sonner";
import { lastTokenUsageAtom } from "../store/agent-settings.atoms";

export function useGenerateSpec() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setLastTokenUsage = useSetAtom(lastTokenUsageAtom);

  return useMutation({
    ...trpc.agentDesk.generateSpec.mutationOptions(),
    onSuccess: (data, variables) => {
      if (data?.usage) {
        setLastTokenUsage(data.usage);
      }
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }) });
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.listSessions.queryKey() });
    },
    onError: (error, variables) => {
      toast.error("스펙 생성 실패: " + (error.message || "알 수 없는 오류"));
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }),
      });
    },
  });
}
