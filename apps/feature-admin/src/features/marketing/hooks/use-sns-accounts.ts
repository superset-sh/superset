/**
 * SNS Account Hooks
 *
 * SNS 계정 연결/해제 관리 훅
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * 연결된 SNS 계정 목록 조회
 */
export function useSnsAccounts() {
  const trpc = useTRPC();
  return useQuery(trpc.marketing.accounts.list.queryOptions());
}

/**
 * SNS 계정 연결 (OAuth 인증 코드 교환)
 */
export function useConnectSnsAccount() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.accounts.connect.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.marketing.accounts.list.queryKey() });
      toast.success("SNS 계정이 연결되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "계정 연결에 실패했습니다.");
    },
  });
}

/**
 * SNS 계정 연결 해제
 */
export function useDisconnectSnsAccount() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.marketing.accounts.disconnect.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.marketing.accounts.list.queryKey() });
      toast.success("SNS 계정 연결이 해제되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message || "계정 연결 해제에 실패했습니다.");
    },
  });
}
