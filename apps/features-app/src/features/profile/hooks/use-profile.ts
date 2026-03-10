import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

export function useProfile() {
  const trpc = useTRPC();

  return useQuery(trpc.profile.me.queryOptions());
}
