import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { toast } from 'sonner';

/**
 * 약관 목록 조회 (Admin — 전체)
 */
export function useAdminTerms() {
  const trpc = useTRPC();
  return useQuery(trpc.profile.admin.termsList.queryOptions());
}

/**
 * 약관 생성
 */
export function useCreateTerm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.profile.admin.termsCreate.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.profile.admin.termsList.queryKey() });
      toast.success('약관이 등록되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '약관 등록에 실패했습니다');
    },
  });
}

/**
 * 약관 수정
 */
export function useUpdateTerm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.profile.admin.termsUpdate.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.profile.admin.termsList.queryKey() });
      toast.success('약관이 수정되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '약관 수정에 실패했습니다');
    },
  });
}

/**
 * 약관 비활성화 (삭제)
 */
export function useDeleteTerm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = trpc.profile.admin.termsDelete.mutationOptions();

  return useMutation({
    mutationFn: options.mutationFn,
    mutationKey: options.mutationKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.profile.admin.termsList.queryKey() });
      toast.success('약관이 비활성화되었습니다');
    },
    onError: (error) => {
      toast.error(error.message || '약관 비활성화에 실패했습니다');
    },
  });
}
