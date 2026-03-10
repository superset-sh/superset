/**
 * Community Feed Hooks
 */
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

interface FeedOptions {
  sort?: "hot" | "new" | "top" | "rising" | "controversial";
  timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all";
  page?: number;
  limit?: number;
}

export function useHomeFeed(options?: FeedOptions) {
  const trpc = useTRPC();
  return useQuery(
    trpc.community.feed.home.queryOptions({
      sort: options?.sort ?? "hot",
      timeFilter: options?.timeFilter ?? "day",
      page: options?.page ?? 1,
      limit: options?.limit ?? 25,
    })
  );
}

export function useAllFeed(options?: FeedOptions) {
  const trpc = useTRPC();
  return useQuery(
    trpc.community.feed.all.queryOptions({
      sort: options?.sort ?? "hot",
      timeFilter: options?.timeFilter ?? "day",
      page: options?.page ?? 1,
      limit: options?.limit ?? 25,
    })
  );
}

export function usePopularFeed(options?: { timeFilter?: "hour" | "day" | "week" | "month" | "year" | "all"; limit?: number }) {
  const trpc = useTRPC();
  return useQuery(
    trpc.community.feed.popular.queryOptions({
      timeFilter: options?.timeFilter ?? "day",
      limit: options?.limit ?? 25,
    })
  );
}
