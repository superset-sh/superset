/**
 * Booking Mutation Hooks
 *
 * 예약 생성, 결제 확인, 취소 뮤테이션 훅
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

// ============================================================================
// Booking Create
// ============================================================================

export function useCreateBooking() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.booking.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.myBookings.queryKey(),
      });
    },
  });
}

// ============================================================================
// Confirm Payment
// ============================================================================

export function useConfirmPayment() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.booking.confirmPayment.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.byId.queryKey(variables.bookingId),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.myBookings.queryKey(),
      });
    },
  });
}

// ============================================================================
// Customer Cancel (Refund)
// ============================================================================

export function useCancelBooking() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.refund.cancel.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.byId.queryKey(variables.bookingId),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.myBookings.queryKey(),
      });
    },
  });
}
