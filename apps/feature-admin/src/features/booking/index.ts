/**
 * Booking Feature - Client (Admin)
 */

// Routes
export {
  BOOKING_ADMIN_PATH,
  BOOKING_ADMIN_PROVIDERS_PATH,
  BOOKING_ADMIN_PRODUCTS_PATH,
  BOOKING_ADMIN_CATEGORIES_PATH,
  BOOKING_ADMIN_BOOKINGS_PATH,
  BOOKING_ADMIN_REFUND_POLICY_PATH,
  createBookingAdminRoutes,
  createBookingAdminDashboardRoute,
  createBookingProviderRoute,
  createBookingProductRoute,
  createBookingCategoryRoute,
  createBookingListRoute,
  createBookingRefundPolicyRoute,
} from "./routes";

// Pages
export {
  BookingAdminDashboard,
  ProviderManagement,
  ProductManagement,
  CategoryManagement,
  BookingManagement,
  RefundPolicyManagement,
} from "./pages";

// Hooks
export {
  useBookingAdminStats,
  useAdminCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useReorderCategories,
  useAdminProviders,
  useUpdateProviderStatus,
  useAdminProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useToggleProductStatus,
  useAdminBookings,
  useForceCancel,
  useForceComplete,
  useForceNoShow,
  useForceRefund,
  useRefundPolicies,
  useCreateRefundPolicy,
  useUpdateRefundPolicy,
  useDeleteRefundPolicy,
} from "./hooks";
