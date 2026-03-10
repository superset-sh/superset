/**
 * Data Tracker Hooks
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * 활성 트래커 목록 조회
 */
export function useTrackerList() {
  const trpc = useTRPC();
  return useQuery(trpc.dataTracker.list.queryOptions());
}

/**
 * Slug로 트래커 조회
 */
export function useTrackerBySlug(slug: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.dataTracker.getBySlug.queryOptions({ slug }),
    enabled: !!slug,
  });
}

/**
 * 트래커 엔트리 페이지네이션 조회
 */
export function useTrackerEntries(
  trackerId: string,
  page: number,
  limit: number,
  viewMode: "personal" | "organization",
) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.dataTracker.getEntries.queryOptions({
      trackerId,
      page,
      limit,
      viewMode,
    }),
    enabled: !!trackerId,
  });
}

/**
 * 트래커 차트 데이터 조회
 */
export function useTrackerChartData(
  trackerId: string,
  days: number,
  viewMode: "personal" | "organization",
) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.dataTracker.getChartData.queryOptions({
      trackerId,
      days,
      viewMode,
    }),
    enabled: !!trackerId,
  });
}

/**
 * 엔트리 추가
 */
export function useAddEntry() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.dataTracker.addEntry.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.dataTracker.getEntries.queryKey({
          trackerId: variables.trackerId,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.dataTracker.getChartData.queryKey({
          trackerId: variables.trackerId,
        }),
      });
    },
  });
}

/**
 * 엔트리 수정
 */
export function useUpdateEntry() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.dataTracker.updateEntry.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dataTracker", "getEntries"],
      });
      queryClient.invalidateQueries({
        queryKey: ["dataTracker", "getChartData"],
      });
    },
  });
}

/**
 * 엔트리 삭제
 */
export function useDeleteEntry() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.dataTracker.deleteEntry.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dataTracker", "getEntries"],
      });
      queryClient.invalidateQueries({
        queryKey: ["dataTracker", "getChartData"],
      });
    },
  });
}

/**
 * CSV 가져오기
 */
export function useImportCsv() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.dataTracker.importCsv.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.dataTracker.getEntries.queryKey({
          trackerId: variables.trackerId,
        }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.dataTracker.getChartData.queryKey({
          trackerId: variables.trackerId,
        }),
      });
    },
  });
}
