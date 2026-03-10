import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc";

/** AI 에이전트에 질문 — 구조화 질문 + 제안 카드 반환 */
export function useAskFlowAgent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.askFlowAgent.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getMessages.queryKey({ sessionId: variables.sessionId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
    },
  });
}

/** AI 제안 적용/무시/수정 */
export function useApplyAiSuggestion() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.applyAiSuggestion.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
    },
  });
}

/** 구현 인계 패키지 생성 */
export function useGenerateImplementationHandoff() {
  const trpc = useTRPC();
  return useMutation(trpc.agentDesk.generateImplementationHandoff.mutationOptions());
}

/** 화면정의서 초안 + Mermaid + QA 매핑 생성 */
export function useGenerateFlowSpecDraft() {
  const trpc = useTRPC();
  return useMutation(trpc.agentDesk.generateFlowSpecDraft.mutationOptions());
}
