import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/** KPI 카드 4개 데이터 */
export function useOverview() {
  const trpc = useTRPC();
  return useQuery(trpc.analytics.getOverview.queryOptions());
}

/** 기간별 트렌드 데이터 */
export function useTrend(metricKey: string, days: number) {
  const trpc = useTRPC();
  return useQuery(trpc.analytics.getTrend.queryOptions({ metricKey, days }));
}

/** 이벤트 분포 데이터 */
export function useDistribution() {
  const trpc = useTRPC();
  return useQuery(trpc.analytics.getDistribution.queryOptions());
}
