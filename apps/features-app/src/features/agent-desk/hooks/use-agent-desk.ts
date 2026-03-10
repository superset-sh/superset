import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { authenticatedAtom } from "@superbuilder/features-client/core/auth";
import type { SessionType } from "../types";

/** 세션 목록 조회 — 인증 완료 후에만 실행 */
export function useSessions(type?: SessionType) {
  const trpc = useTRPC();
  const authenticated = useAtomValue(authenticatedAtom);
  return useQuery({
    ...trpc.agentDesk.listSessions.queryOptions({ type }),
    enabled: authenticated === true,
  });
}

/** 세션 상세 조회 (파일 + 메시지 포함) */
export function useSession(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.agentDesk.getSession.queryOptions({ id }),
    enabled: !!id,
  });
}

/** 세션 생성 */
export function useCreateSession() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.createSession.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.listSessions.queryKey() });
    },
  });
}

/** 세션 삭제 */
export function useDeleteSession() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.deleteSession.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.listSessions.queryKey() });
    },
  });
}

/** 세션 상태 변경 */
export function useUpdateSessionStatus() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.updateSessionStatus.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.id }) });
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.listSessions.queryKey() });
    },
  });
}

/** 메시지 전송 */
export function useSendMessage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.sendMessage.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.getMessages.queryKey({ sessionId: variables.sessionId }) });
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.getSession.queryKey({ id: variables.sessionId }) });
    },
  });
}

/** 대화 이력 조회 */
export function useMessages(sessionId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.agentDesk.getMessages.queryOptions({ sessionId }),
    enabled: !!sessionId,
  });
}

/** 메시지 피드백 (좋아요/싫어요) */
export function useUpdateMessageFeedback(sessionId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.updateMessageFeedback.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.agentDesk.getMessages.queryKey({ sessionId }),
      });
    },
  });
}

/** 파일 업로드 확인 */
export function useConfirmUpload() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.confirmUpload.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.getFiles.queryKey({ sessionId: variables.sessionId }) });
    },
  });
}

/** 파일 삭제 */
export function useRemoveFile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.removeFile.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.getFiles.queryKey() });
    },
  });
}

/** 파일 파싱 */
export function useParseFile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.agentDesk.parseFile.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.agentDesk.getFiles.queryKey() });
    },
  });
}

/** 세션 파일 목록 */
export function useFiles(sessionId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.agentDesk.getFiles.queryOptions({ sessionId }),
    enabled: !!sessionId,
  });
}

/** 사용 가능한 LLM 모델 목록 — 인증 완료 후에만 실행 */
export function useModels() {
  const trpc = useTRPC();
  const authenticated = useAtomValue(authenticatedAtom);
  return useQuery({
    ...trpc.agentDesk.getModels.queryOptions(),
    enabled: authenticated === true,
  });
}

/** 최신 실행 기록 조회 */
export function useLatestExecution(sessionId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.agentDesk.getLatestExecution.queryOptions({ sessionId }),
    enabled: !!sessionId,
  });
}
