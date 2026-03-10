import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentTrpc } from "./use-agent-trpc";

const AGENTS_KEY = ["agent", "agents"];

/** 활성 에이전트 목록 조회 */
export function useAgents() {
  return useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => agentTrpc.agents.list.query(),
  });
}

/** 에이전트 상세 조회 */
export function useAgent(id: string | undefined) {
  return useQuery({
    queryKey: [...AGENTS_KEY, id],
    queryFn: () => agentTrpc.agents.getById.query({ id: id! }),
    enabled: !!id,
  });
}

/** 에이전트 CRUD 뮤테이션 */
export function useAgentMutations() {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: AGENTS_KEY });

  const create = useMutation({
    mutationFn: (input: Parameters<typeof agentTrpc.agents.create.mutate>[0]) =>
      agentTrpc.agents.create.mutate(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (input: Parameters<typeof agentTrpc.agents.update.mutate>[0]) =>
      agentTrpc.agents.update.mutate(input),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (input: Parameters<typeof agentTrpc.agents.delete.mutate>[0]) =>
      agentTrpc.agents.delete.mutate(input),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
