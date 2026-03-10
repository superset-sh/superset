/**
 * Community Moderation Hooks (커뮤니티 레벨)
 *
 * 특정 커뮤니티의 모더레이션 데이터 조회용 hooks
 * Admin 전체 조회는 use-admin-community.ts 참조
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { toast } from 'sonner';

/**
 * 모더레이션 큐 조회 (커뮤니티 레벨)
 */
export function useModerationQueue(communityId: string, enabled = true) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.community.moderation.queue.queryOptions({ communityId }),
    enabled: !!communityId && enabled,
  });
}

/**
 * 신고 목록 조회 (커뮤니티 레벨)
 */
export function useModerationReports(
  communityId: string,
  status?: 'pending' | 'reviewing' | 'resolved' | 'dismissed',
  enabled = true,
) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.community.moderation.reports.queryOptions({ communityId, status }),
    enabled: !!communityId && enabled,
  });
}

/**
 * 모더레이션 로그 조회 (커뮤니티 레벨)
 */
export function useModerationLogs(
  input: { communityId: string; page?: number; limit?: number },
  enabled = true,
) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.community.moderation.logs.queryOptions(input),
    enabled: !!input.communityId && enabled,
  });
}

/**
 * 신고 처리 (커뮤니티 모더레이터)
 */
export function useResolveReportMod() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.community.moderation.resolveReport.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.moderation.reports.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.moderation.queue.queryKey() });
      toast.success('신고가 처리되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '신고 처리에 실패했습니다');
    },
  });
}
