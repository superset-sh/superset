import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { useState } from "react";

export function useMyRedemption() {
  const trpc = useTRPC();
  return useQuery(trpc.coupon.myRedemption.queryOptions());
}

export function useValidateCoupon() {
  const trpc = useTRPC();
  const [input, setInput] = useState<{ code: string; planId?: string } | null>(
    null,
  );

  const query = useQuery({
    ...trpc.coupon.validate.queryOptions(input!),
    enabled: input !== null,
  });

  return {
    ...query,
    isPending: query.isFetching,
    mutate: (params: { code: string; planId?: string }) => {
      setInput(params);
    },
    reset: () => {
      setInput(null);
    },
  };
}

export function useApplyCoupon() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.coupon.applyCoupon.mutationOptions() as any,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.coupon.myRedemption.queryKey(),
      });
    },
  });
}

export function useCancelCoupon() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.coupon.cancel.mutationOptions() as any,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.coupon.myRedemption.queryKey(),
      });
    },
  });
}
