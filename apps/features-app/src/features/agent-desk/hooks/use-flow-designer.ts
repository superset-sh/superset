import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

/** 화면 흐름 데이터 조회 */
export function useFlowData(sessionId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.agentDesk.getFlowData.queryOptions({ sessionId }),
    enabled: !!sessionId,
  });
}

/** 화면 추가 */
export function useAddScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.addScreen.mutationOptions(),
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

/** 화면 업데이트 */
export function useUpdateScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.updateScreen.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
    },
  });
}

/** 화면 삭제 */
export function useRemoveScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.removeScreen.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
    },
  });
}

/** 디자이너 설정 업데이트 */
export function useUpdateDesignerSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.updateDesignerSettings.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }),
      });
    },
  });
}

/** 화면 흐름 설계 완료 */
export function useCompleteFlowDesign() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.completeFlowDesign.mutationOptions(),
    onError: (error) => {
      console.error("completeDesign error:", error);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getFlowData.queryKey({ sessionId: variables.sessionId }),
      });
    },
  });
}
