/**
 * Marketing Admin Hooks
 *
 * 관리자 전용 훅 (전체 캠페인/콘텐츠 조회, 통계)
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery } from "@tanstack/react-query";

/**
 * 전체 캠페인 목록 (관리자용)
 */
export function useAdminCampaigns(page = 1, limit = 20) {
  const trpc = useTRPC();
  return useQuery(trpc.marketing.admin.allCampaigns.queryOptions({ page, limit }));
}

/**
 * 전체 콘텐츠 목록 (관리자용)
 */
export function useAdminContents(page = 1, limit = 20) {
  const trpc = useTRPC();
  return useQuery(trpc.marketing.admin.allContents.queryOptions({ page, limit }));
}

/**
 * 마케팅 전체 통계 (관리자용)
 */
export function useAdminStats() {
  const trpc = useTRPC();
  return useQuery(trpc.marketing.admin.stats.queryOptions());
}
