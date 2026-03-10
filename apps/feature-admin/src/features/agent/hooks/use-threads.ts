import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentTrpc } from "./use-agent-trpc";

const THREADS_KEY = ["agent", "threads"];

/** 내 스레드 목록 */
export function useThreads() {
  return useQuery({
    queryKey: THREADS_KEY,
    queryFn: () => agentTrpc.threads.list.query(),
  });
}

/** 스레드 상세 */
export function useThread(id: string | undefined) {
  return useQuery({
    queryKey: [...THREADS_KEY, id],
    queryFn: () => agentTrpc.threads.getById.query({ id: id! }),
    enabled: !!id,
  });
}

/** 스레드 내 메시지 목록 */
export function useThreadMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: ["agent", "messages", threadId],
    queryFn: () =>
      agentTrpc.messages.list.query({ threadId: threadId! }),
    enabled: !!threadId,
  });
}

/** 스레드 뮤테이션 */
export function useThreadMutations() {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: THREADS_KEY });

  const create = useMutation({
    mutationFn: (input: Parameters<typeof agentTrpc.threads.create.mutate>[0]) =>
      agentTrpc.threads.create.mutate(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (input: Parameters<typeof agentTrpc.threads.update.mutate>[0]) =>
      agentTrpc.threads.update.mutate(input),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (input: Parameters<typeof agentTrpc.threads.delete.mutate>[0]) =>
      agentTrpc.threads.delete.mutate(input),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
