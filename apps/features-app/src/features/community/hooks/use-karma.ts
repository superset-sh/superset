import { useQueries } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export interface KarmaSummary {
  userId: string;
  postKarma: number;
  commentKarma: number;
  totalKarma: number;
}

const BATCH_SIZE = 50;

export function useKarma(userIds: string[]) {
  const trpc = useTRPC();
  const uniqueIds = [...new Set(userIds)].sort();

  const chunks: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    chunks.push(uniqueIds.slice(i, i + BATCH_SIZE));
  }

  const queries = useQueries({
    queries: chunks.map((chunk) => ({
      ...trpc.community.karma.getBatch.queryOptions({ userIds: chunk }),
      staleTime: 5 * 60 * 1000,
      enabled: chunk.length > 0,
    })),
    combine: (results) => {
      const allData: KarmaSummary[] = [];
      let isLoading = false;

      for (const result of results) {
        if (result.isLoading) isLoading = true;
        if (result.data) {
          allData.push(...(result.data as KarmaSummary[]));
        }
      }

      const map = new Map<string, KarmaSummary>();
      for (const item of allData) {
        map.set(item.userId, item);
      }

      return { data: map, isLoading };
    },
  });

  return queries;
}
