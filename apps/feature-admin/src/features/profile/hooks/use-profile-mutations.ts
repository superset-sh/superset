import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

export function useUpdateProfile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: trpc.profile.update.mutationOptions().mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.profile.me.queryKey() });
    },
  });
}
