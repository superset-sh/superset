import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { toast } from 'sonner';

interface AdminUsersInput {
  page: number;
  limit: number;
  search?: string;
  marketingConsent?: 'agreed' | 'not_agreed';
}

/**
 * 전체 사용자 목록 조회 (Admin)
 */
export function useAdminUsers(input: AdminUsersInput) {
  const trpc = useTRPC();
  return useQuery(trpc.profile.admin.list.queryOptions(input));
}

/**
 * 사용자 역할 변경 (Admin)
 */
export function useUpdateUserRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.profile.admin.updateRole.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.profile.admin.list.queryKey() });
      toast.success('역할이 변경되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '역할 변경에 실패했습니다');
    },
  });
}

/**
 * 사용자 비활성화 (Admin)
 */
export function useDeactivateUser() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.profile.admin.deactivate.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.profile.admin.list.queryKey() });
      toast.success('사용자가 비활성화되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '비활성화에 실패했습니다');
    },
  });
}

/**
 * 사용자 활성화 (Admin)
 */
export function useReactivateUser() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.profile.admin.reactivate.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.profile.admin.list.queryKey() });
      toast.success('사용자가 활성화되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '활성화에 실패했습니다');
    },
  });
}
