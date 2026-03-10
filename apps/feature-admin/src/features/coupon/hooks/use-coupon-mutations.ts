import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useCouponDeactivate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const mutation = useMutation(
    trpc.coupon.admin.deactivate.mutationOptions(),
  );

  const deactivate = (couponId: string) => {
    mutation.mutate(couponId, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.coupon.admin.list.queryKey(),
        });
      },
    });
  };

  return {
    deactivate,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

export function useCouponDelete() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const mutation = useMutation(
    trpc.coupon.admin.delete.mutationOptions(),
  );

  const deleteCoupon = (couponId: string) => {
    mutation.mutate(couponId, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.coupon.admin.list.queryKey(),
        });
      },
    });
  };

  return {
    deleteCoupon,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
