/**
 * Campaign Hooks
 *
 * 캠페인 CRUD 훅
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * 캠페인 목록 조회 (페이지네이션)
 */
export function useCampaigns(page = 1, limit = 20) {
  const trpc = useTRPC();
  return useQuery(trpc.marketing.campaigns.list.queryOptions({ page, limit }));
}

/**
 * 캠페인 상세 조회
 */
export function useCampaignById(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.marketing.campaigns.byId.queryOptions(id),
    enabled: !!id,
  });
}

/**
 * 캠페인 생성
 */
export function useCreateCampaign() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.campaigns.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.marketing.campaigns.list.queryKey() });
      toast.success("캠페인이 생성되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "캠페인 생성에 실패했습니다.");
    },
  });
}

/**
 * 캠페인 수정
 */
export function useUpdateCampaign() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.campaigns.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing", "campaigns"] });
      toast.success("캠페인이 수정되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "캠페인 수정에 실패했습니다.");
    },
  });
}

/**
 * 캠페인 삭제
 */
export function useDeleteCampaign() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.campaigns.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.marketing.campaigns.list.queryKey() });
      toast.success("캠페인이 삭제되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "캠페인 삭제에 실패했습니다.");
    },
  });
}
