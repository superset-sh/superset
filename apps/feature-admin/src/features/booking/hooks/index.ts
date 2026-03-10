/**
 * Booking Admin Hooks
 *
 * Admin 전용 tRPC hooks (예약 관리, 카테고리, 상담사, 상품, 환불정책)
 */
import { useTRPC } from "../../../lib/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================================
// Stats
// ============================================================================

export function useBookingAdminStats() {
  const trpc = useTRPC();
  return useQuery(trpc.booking.admin.stats.queryOptions());
}

// ============================================================================
// Categories
// ============================================================================

interface AdminCategoryListInput {
  page?: number;
  limit?: number;
  search?: string;
}

export function useAdminCategories(input: AdminCategoryListInput = {}) {
  const trpc = useTRPC();
  return useQuery(trpc.booking.admin.categories.list.queryOptions(input));
}

export function useCreateCategory() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.categories.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.categories.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.stats.queryKey(),
      });
    },
  });
}

export function useUpdateCategory() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.categories.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.categories.list.queryKey(),
      });
    },
  });
}

export function useDeleteCategory() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.categories.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.categories.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.stats.queryKey(),
      });
    },
  });
}

export function useReorderCategories() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.categories.reorder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.categories.list.queryKey(),
      });
    },
  });
}

export function useToggleCategoryActive() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.categories.toggleActive.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.categories.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.stats.queryKey(),
      });
    },
  });
}

// ============================================================================
// Providers
// ============================================================================

interface AdminProviderListInput {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

export function useAdminProviders(input: AdminProviderListInput = {}) {
  const trpc = useTRPC();
  return useQuery(trpc.booking.admin.providers.list.queryOptions(input));
}

export function useAdminProviderDetail(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.admin.providers.getDetail.queryOptions(id),
    enabled: !!id,
  });
}

export function useAdminRegisterProvider() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.providers.register.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.providers.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.stats.queryKey(),
      });
    },
  });
}

export function useUpdateProviderStatus() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.providers.updateStatus.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.providers.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.stats.queryKey(),
      });
    },
  });
}

// ============================================================================
// Products
// ============================================================================

interface AdminProductListInput {
  page?: number;
  limit?: number;
  search?: string;
}

export function useAdminProducts(input: AdminProductListInput = {}) {
  const trpc = useTRPC();
  return useQuery(trpc.booking.admin.products.list.queryOptions(input));
}

export function useCreateProduct() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.products.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.products.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.stats.queryKey(),
      });
    },
  });
}

export function useUpdateProduct() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.products.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.products.list.queryKey(),
      });
    },
  });
}

export function useDeleteProduct() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.products.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.products.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.stats.queryKey(),
      });
    },
  });
}

export function useToggleProductStatus() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.products.toggleStatus.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.products.list.queryKey(),
      });
    },
  });
}

// ============================================================================
// Bookings
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

interface AdminBookingListInput {
  status?: BookingStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export function useAdminBookings(input: AdminBookingListInput = {}) {
  const trpc = useTRPC();
  return useQuery(trpc.booking.admin.bookings.list.queryOptions(input));
}

export function useAdminBookingDetail(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.admin.bookings.getDetail.queryOptions(id),
    enabled: !!id,
  });
}

export function useForceCancel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.bookings.forceCancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.bookings.list.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.stats.queryKey(),
      });
    },
  });
}

export function useForceComplete() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.bookings.forceComplete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.bookings.list.queryKey(),
      });
    },
  });
}

export function useForceNoShow() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.bookings.forceNoShow.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.bookings.list.queryKey(),
      });
    },
  });
}

export function useForceRefund() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.bookings.forceRefund.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.bookings.list.queryKey(),
      });
    },
  });
}

// ============================================================================
// Refund Policy
// ============================================================================

export function useRefundPolicies() {
  const trpc = useTRPC();
  return useQuery(trpc.booking.admin.refundPolicy.list.queryOptions());
}

export function useCreateRefundPolicy() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.refundPolicy.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.refundPolicy.list.queryKey(),
      });
    },
  });
}

export function useUpdateRefundPolicy() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.refundPolicy.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.refundPolicy.list.queryKey(),
      });
    },
  });
}

export function useDeleteRefundPolicy() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.booking.admin.refundPolicy.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.booking.admin.refundPolicy.list.queryKey(),
      });
    },
  });
}
