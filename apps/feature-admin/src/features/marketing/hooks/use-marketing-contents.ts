/**
 * Marketing Content Hooks
 *
 * 마케팅 콘텐츠 CRUD 훅
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * 콘텐츠 목록 조회 (필터 + 페이지네이션)
 */
export function useMarketingContents(filters?: {
  campaignId?: string;
  page?: number;
  limit?: number;
}) {
  const trpc = useTRPC();
  return useQuery(
    trpc.marketing.contents.list.queryOptions({
      campaignId: filters?.campaignId,
      page: filters?.page ?? 1,
      limit: filters?.limit ?? 20,
    }),
  );
}

/**
 * 콘텐츠 상세 조회
 */
export function useMarketingContentById(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.marketing.contents.byId.queryOptions(id),
    enabled: !!id,
  });
}

/**
 * 콘텐츠 생성 (에디터에서 직접 작성)
 */
export function useCreateMarketingContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.contents.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.marketing.contents.list.queryKey() });
      toast.success("콘텐츠가 생성되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "콘텐츠 생성에 실패했습니다.");
    },
  });
}

/**
 * 소스 콘텐츠로부터 마케팅 콘텐츠 초안 생성 (위젯 패턴)
 */
export function useCreateContentFromSource() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.contents.createFromSource.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.marketing.contents.list.queryKey() });
      toast.success("소스에서 콘텐츠 초안이 생성되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "콘텐츠 초안 생성에 실패했습니다.");
    },
  });
}

/**
 * 콘텐츠 수정
 */
export function useUpdateMarketingContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.contents.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing", "contents"] });
      toast.success("콘텐츠가 수정되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "콘텐츠 수정에 실패했습니다.");
    },
  });
}

/**
 * 콘텐츠 삭제
 */
export function useDeleteMarketingContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.contents.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.marketing.contents.list.queryKey() });
      toast.success("콘텐츠가 삭제되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "콘텐츠 삭제에 실패했습니다.");
    },
  });
}
