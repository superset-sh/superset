import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { toast } from 'sonner';

// ============================================================================
// Query Hooks
// ============================================================================

interface AdminCommunitiesInput {
  page: number;
  limit: number;
  search?: string;
  type?: 'public' | 'restricted' | 'private';
}

/**
 * 커뮤니티 목록 (Admin)
 */
export function useAdminCommunities(input: AdminCommunitiesInput) {
  const trpc = useTRPC();
  return useQuery(trpc.community.admin.list.queryOptions(input));
}

/**
 * 전체 통계 (Admin)
 */
export function useCommunityStats() {
  const trpc = useTRPC();
  return useQuery(trpc.community.admin.stats.queryOptions());
}

interface AdminReportsInput {
  page: number;
  limit: number;
  status?: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
}

/**
 * 전체 신고 목록 (Admin)
 */
export function useAdminReports(input: AdminReportsInput) {
  const trpc = useTRPC();
  return useQuery(trpc.community.admin.reports.queryOptions(input));
}

/**
 * 신고 통계 (Admin)
 */
export function useReportStats() {
  const trpc = useTRPC();
  return useQuery(trpc.community.admin.reportStats.queryOptions());
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * 커뮤니티 삭제 (Admin)
 */
export function useDeleteCommunity() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.community.admin.delete.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.admin.list.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.admin.stats.queryKey() });
      toast.success('커뮤니티가 삭제되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '삭제에 실패했습니다');
    },
  });
}

/**
 * 신고 처리 (Admin)
 */
export function useResolveReport() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.community.admin.resolveReport.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.admin.reports.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.admin.reportStats.queryKey() });
      toast.success('신고가 처리되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '신고 처리에 실패했습니다');
    },
  });
}

/**
 * 사용자 밴 (Admin)
 */
export function useAdminBanUser() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.community.admin.banUser.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.admin.reports.queryKey() });
      toast.success('사용자가 밴되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '밴 처리에 실패했습니다');
    },
  });
}

/**
 * 밴 해제 (Admin)
 */
export function useAdminUnbanUser() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.community.admin.unbanUser.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.admin.reports.queryKey() });
      toast.success('밴이 해제되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '밴 해제에 실패했습니다');
    },
  });
}
