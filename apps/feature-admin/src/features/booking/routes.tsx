/**
 * Booking Feature - Admin Routes
 */
import { createRoute, type AnyRoute } from "@tanstack/react-router";
import {
  BookingAdminDashboard,
  ProviderManagement,
  ProductManagement,
  CategoryManagement,
  BookingManagement,
  RefundPolicyManagement,
} from "./pages";

// ============================================================================
// Route Paths
// ============================================================================

export const BOOKING_ADMIN_PATH = "/booking";
export const BOOKING_ADMIN_PROVIDERS_PATH = "/booking/providers";
export const BOOKING_ADMIN_PRODUCTS_PATH = "/booking/products";
export const BOOKING_ADMIN_CATEGORIES_PATH = "/booking/categories";
export const BOOKING_ADMIN_BOOKINGS_PATH = "/booking/bookings";
export const BOOKING_ADMIN_REFUND_POLICY_PATH = "/booking/refund-policy";

// ============================================================================
// Admin Routes
// ============================================================================

/** Admin 예약 대시보드 */
export const createBookingAdminDashboardRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/booking",
    component: BookingAdminDashboard,
  });

/** Admin 상담사 관리 */
export const createBookingProviderRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/booking/providers",
    component: ProviderManagement,
  });

/** Admin 세션 상품 관리 */
export const createBookingProductRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/booking/products",
    component: ProductManagement,
  });

/** Admin 카테고리 관리 */
export const createBookingCategoryRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/booking/categories",
    component: CategoryManagement,
  });

/** Admin 예약 목록 */
export const createBookingListRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/booking/bookings",
    component: BookingManagement,
  });

/** Admin 환불 정책 관리 */
export const createBookingRefundPolicyRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/booking/refund-policy",
    component: RefundPolicyManagement,
  });

// ============================================================================
// Route Groups
// ============================================================================

/** Booking의 모든 Admin Routes */
export function createBookingAdminRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createBookingAdminDashboardRoute(parentRoute),
    createBookingProviderRoute(parentRoute),
    createBookingProductRoute(parentRoute),
    createBookingCategoryRoute(parentRoute),
    createBookingListRoute(parentRoute),
    createBookingRefundPolicyRoute(parentRoute),
  ];
}
