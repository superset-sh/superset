/**
 * Publish Hooks
 *
 * 즉시 발행, 예약 발행, 플랫폼 제약사항 조회 훅
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * 즉시 발행
 */
export function usePublishNow() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.publish.now.mutationOptions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["marketing"] });
      const successCount = data.results.filter((r) => r.success).length;
      const failCount = data.results.filter((r) => !r.success).length;
      if (failCount === 0) {
        toast.success(`${successCount}개 플랫폼에 발행되었습니다.`);
      } else {
        toast.warning(`${successCount}개 성공, ${failCount}개 실패`);
      }
    },
    onError: (error) => {
      toast.error(error.message || "발행에 실패했습니다.");
    },
  });
}

/**
 * 예약 발행
 */
export function useSchedulePublish() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.publish.schedule.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing"] });
      toast.success("발행이 예약되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "예약 발행에 실패했습니다.");
    },
  });
}

/**
 * 플랫폼 제약사항 조회
 */
export function usePlatformConstraints() {
  const trpc = useTRPC();
  return useQuery(trpc.marketing.publish.constraints.queryOptions());
}
