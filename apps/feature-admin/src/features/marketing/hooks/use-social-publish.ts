/**
 * Social Publish Hook
 *
 * 위젯 패턴에 특화된 소셜 발행 훅
 * 다른 Feature(블로그, 게시판 등)에서 콘텐츠를 소셜 미디어로 발행할 때 사용
 */
import { useTRPC } from "../../../lib/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useSocialPublish() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createFromSource = useMutation({
    ...trpc.marketing.contents.createFromSource.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.marketing.contents.list.queryKey() });
    },
    onError: (error) => {
      toast.error(error.message || "콘텐츠 초안 생성에 실패했습니다.");
    },
  });

  const publishNow = useMutation({
    ...trpc.marketing.publish.now.mutationOptions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["marketing"] });
      const successCount = data.results.filter((r) => r.success).length;
      if (successCount > 0) {
        toast.success(`${successCount}개 플랫폼에 발행되었습니다.`);
      }
    },
    onError: (error) => {
      toast.error(error.message || "발행에 실패했습니다.");
    },
  });

  return { createFromSource, publishNow };
}
