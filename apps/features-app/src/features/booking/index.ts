/**
 * Booking Feature - Client
 */

// Routes
export {
  BOOKING_PATH,
  MY_BOOKINGS_PATH,
  PROVIDER_DASHBOARD_PATH,
  PROVIDER_SCHEDULE_PATH,
  PROVIDER_SESSIONS_PATH,
  PROVIDER_PROFILE_PATH,
  createBookingRoutes,
  createBookingAuthRoutes,
  createBookingProviderRoutes,
  createBookingSearchRoute,
  createProviderDetailRoute,
  createCreateBookingRoute,
  createMyBookingsRoute,
  createBookingDetailRoute,
  createProviderDashboardRoute,
  createProviderScheduleRoute,
  createProviderSessionsRoute,
  createProviderProfileEditRoute,
} from "./routes";

// Pages (Customer)
export { BookingSearch } from "./pages/booking-search";
export { ProviderDetail } from "./pages/provider-detail";
export { CreateBooking } from "./pages/create-booking";
export { MyBookings } from "./pages/my-bookings";
export { BookingDetail } from "./pages/booking-detail";

// Pages (Provider)
export { ProviderDashboard } from "./pages/provider/provider-dashboard";
export { ProviderSchedule } from "./pages/provider/provider-schedule";
export { ProviderSessions } from "./pages/provider/provider-sessions";
export { ProviderProfileEdit } from "./pages/provider/provider-profile-edit";

// Hooks
export {
  useBookingCategories,
  useBookingCategoryBySlug,
  useProviderList,
  useProviderById,
  useProviderSearch,
  useProviderMatch,
  useAvailableSlots,
  useMyBookings,
  useBookingById,
  useRefundPreview,
  useCreateBooking,
  useConfirmPayment,
  useCancelBooking,
  useMyProviderProfile,
  useRegisterAsProvider,
  useUpdateProviderProfile,
  useWeeklySchedule,
  useUpdateWeeklySchedule,
  useScheduleOverrides,
  useCreateOverride,
  useDeleteOverride,
  useProviderBookings,
  useCompleteSession,
  useMarkNoShow,
  useProviderCancelBooking,
} from "./hooks";

// Components
export { ProviderCard } from "./components/provider-card";
export { BookingStatusBadge } from "./components/booking-status-badge";
export { SlotPicker } from "./components/slot-picker";
export { RefundPreviewDialog } from "./components/refund-preview-dialog";
