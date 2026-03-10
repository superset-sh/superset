import { useQuery } from "@tanstack/react-query";
import { agentTrpc } from "./use-agent-trpc";

const USAGE_KEY = ["agent", "usage"];

/** 사용량 요약 */
export function useUsageSummary(days?: number) {
  return useQuery({
    queryKey: [...USAGE_KEY, "summary", days],
    queryFn: () => agentTrpc.usage.summary.query(days ? { days } : undefined),
  });
}

/** 모델별 사용량 */
export function useUsageByModel(days?: number) {
  return useQuery({
    queryKey: [...USAGE_KEY, "byModel", days],
    queryFn: () => agentTrpc.usage.byModel.query(days ? { days } : undefined),
  });
}

/** 에이전트별 사용량 */
export function useUsageByAgent(days?: number) {
  return useQuery({
    queryKey: [...USAGE_KEY, "byAgent", days],
    queryFn: () => agentTrpc.usage.byAgent.query(days ? { days } : undefined),
  });
}
