import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

/** Admin: 전체 스튜디오 목록 조회 (soft delete 포함) */
export function useAdminStudios() {
  const trpc = useTRPC();
  return useQuery(trpc.contentStudio.adminList.queryOptions());
}
