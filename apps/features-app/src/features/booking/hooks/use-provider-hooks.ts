/**
 * Provider Hooks
 *
 * 상담사 프로필, 스케줄, 예약 관리 훅
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

// ============================================================================
// Provider Profile
// ============================================================================

export function useMyProviderProfile() {
  const trpc = useTRPC();
  return useQuery(trpc.booking.provider.myProfile.queryOptions());
}

export function useRegisterAsProvider() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.provider.register.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.provider.myProfile.queryKey(),
      });
    },
  });
}

export function useUpdateProviderProfile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.provider.updateProfile.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.provider.myProfile.queryKey(),
      });
    },
  });
}

// ============================================================================
// Schedule Management
// ============================================================================

export function useWeeklySchedule(providerId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.availability.weeklySchedule.queryOptions(providerId),
    enabled: !!providerId,
  });
}

export function useUpdateWeeklySchedule() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.availability.updateSchedule.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.availability.weeklySchedule.queryKey(
          variables.providerId,
        ),
      });
    },
  });
}

export function useScheduleOverrides(
  providerId: string,
  dateFrom: string,
  dateTo: string,
) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.availability.overrides.queryOptions({
      providerId,
      dateFrom,
      dateTo,
    }),
    enabled: !!providerId && !!dateFrom && !!dateTo,
  });
}

export function useCreateOverride() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.availability.createOverride.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.availability.overrides.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.availability.weeklySchedule.queryKey(
          variables.providerId,
        ),
      });
    },
  });
}

export function useDeleteOverride() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.availability.deleteOverride.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.availability.overrides.queryKey(),
      });
    },
  });
}

// ============================================================================
// Provider Bookings
// ============================================================================

type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "no_show"
  | "cancelled_by_user"
  | "cancelled_by_provider"
  | "refunded"
  | "expired";

interface ProviderBookingQuery {
  status?: BookingStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export function useProviderBookings(
  providerId: string,
  query: ProviderBookingQuery = {},
) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.booking.providerBookings.queryOptions({
      providerId,
      query,
    }),
    enabled: !!providerId,
  });
}

export function useCompleteSession() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.booking.complete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.providerBookings.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.byId.queryKey(),
      });
    },
  });
}

export function useMarkNoShow() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.booking.markNoShow.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.providerBookings.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.byId.queryKey(),
      });
    },
  });
}

export function useProviderCancelBooking() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.booking.refund.providerCancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.providerBookings.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.booking.byId.queryKey(),
      });
    },
  });
}
