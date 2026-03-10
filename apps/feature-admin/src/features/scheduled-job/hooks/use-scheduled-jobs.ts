import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/** 잡 목록 조회 */
export function useScheduledJobs() {
  const trpc = useTRPC();
  return useQuery(trpc.scheduledJob.listJobs.queryOptions());
}

/** 잡 실행 이력 조회 */
export function useJobRuns(jobId: string | null, page = 1, limit = 20) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.scheduledJob.getJobRuns.queryOptions({ jobId: jobId!, page, limit }),
    enabled: !!jobId,
  });
}

/** 잡 활성/비활성 토글 */
export function useToggleJob() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.scheduledJob.toggleJob.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.scheduledJob.listJobs.queryKey() });
    },
  });
}

/** 수동 실행 트리거 */
export function useRunJobNow() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.scheduledJob.runJobNow.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.scheduledJob.listJobs.queryKey() });
    },
  });
}
