/**
 * Hello World Hook — tRPC 기반
 */
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

export function useHelloWorld() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.helloWorld.hello.queryOptions());

  return {
    message: data?.message ?? '',
    loading: isLoading,
  };
}
