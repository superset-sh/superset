/**
 * Community Hooks
 */
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useCommunities(options?: {
  search?: string;
  type?: "public" | "restricted" | "private";
  sort?: "newest" | "popular" | "name";
  limit?: number;
}) {
  const trpc = useTRPC();
  return useInfiniteQuery(
    trpc.community.community.list.infiniteQueryOptions(
      options ?? {},
      { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
    ),
  );
}

export function useCommunity(slug: string) {
  const trpc = useTRPC();
  return useQuery(trpc.community.community.bySlug.queryOptions(slug));
}

export function usePopularCommunities(limit?: number) {
  const trpc = useTRPC();
  return useQuery(trpc.community.community.popular.queryOptions({ limit: limit ?? 10 }));
}

export function useMySubscriptions() {
  const trpc = useTRPC();
  return useQuery(trpc.community.community.mySubscriptions.queryOptions());
}

export function useMyMembership(slug: string) {
  const trpc = useTRPC();
  return useQuery(trpc.community.community.myMembership.queryOptions(slug));
}

export function useCreateCommunity() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.community.community.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.community.community.list.queryKey() });
    },
  });
}

export function useJoinCommunity() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.community.community.join.mutationOptions(),
    onSuccess: (_data, slug) => {
      queryClient.invalidateQueries({ queryKey: trpc.community.community.mySubscriptions.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.community.myMembership.queryKey(slug) });
      queryClient.invalidateQueries({ queryKey: trpc.community.community.bySlug.queryKey(slug) });
    },
  });
}

export function useLeaveCommunity() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.community.community.leave.mutationOptions(),
    onSuccess: (_data, slug) => {
      queryClient.invalidateQueries({ queryKey: trpc.community.community.mySubscriptions.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.community.community.myMembership.queryKey(slug) });
      queryClient.invalidateQueries({ queryKey: trpc.community.community.bySlug.queryKey(slug) });
    },
  });
}
