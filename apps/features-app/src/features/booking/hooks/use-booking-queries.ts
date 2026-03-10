/**
 * Booking Query Hooks
 *
 * 카테고리, 상담사, 가용시간, 예약 조회 훅
 */
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

// ============================================================================
// Category
// ============================================================================

export function useBookingCategories() {
  const trpc = useTRPC();
  return useQuery(trpc.booking.category.list.queryOptions());
}

export function useBookingCategoryBySlug(slug: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.category.bySlug.queryOptions(slug),
    enabled: !!slug,
  });
}

// ============================================================================
// Provider
// ============================================================================

export function useProviderList() {
  const trpc = useTRPC();
  return useQuery(trpc.booking.provider.list.queryOptions());
}

export function useProviderById(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.provider.byId.queryOptions(id),
    enabled: !!id,
  });
}

// ============================================================================
// Matching / Search
// ============================================================================

interface SearchParams {
  categoryId?: string;
  keyword?: string;
  budgetMin?: number;
  budgetMax?: number;
  language?: string;
  consultationMode?: "online" | "offline" | "hybrid";
  date?: string;
  page?: number;
  limit?: number;
}

export function useProviderSearch(params: SearchParams) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.matching.search.queryOptions(params),
  });
}

export function useProviderMatch(params: SearchParams) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.matching.match.queryOptions(params),
  });
}

// ============================================================================
// Availability
// ============================================================================

interface SlotParams {
  providerId: string;
  date: string;
  durationMinutes: number;
}

export function useAvailableSlots(params: SlotParams) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.availability.slots.queryOptions(params),
    enabled: !!params.providerId && !!params.date && params.durationMinutes > 0,
  });
}

// ============================================================================
// Bookings (Auth)
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

interface BookingQueryParams {
  status?: BookingStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export function useMyBookings(params: BookingQueryParams = {}) {
  const trpc = useTRPC();
  return useQuery(trpc.booking.booking.myBookings.queryOptions(params));
}

export function useBookingById(id: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.booking.byId.queryOptions(id),
    enabled: !!id,
  });
}

// ============================================================================
// Refund Preview (Auth)
// ============================================================================

export function useRefundPreview(bookingId: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.booking.refund.preview.queryOptions(bookingId),
    enabled: !!bookingId,
  });
}
