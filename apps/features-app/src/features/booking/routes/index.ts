/**
 * Booking Feature - Routes
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { BookingSearch } from "../pages/booking-search";
import { ProviderDetail } from "../pages/provider-detail";
import { CreateBooking } from "../pages/create-booking";
import { MyBookings } from "../pages/my-bookings";
import { BookingDetail } from "../pages/booking-detail";
import { ProviderDashboard } from "../pages/provider/provider-dashboard";
import { ProviderSchedule } from "../pages/provider/provider-schedule";
import { ProviderSessions } from "../pages/provider/provider-sessions";
import { ProviderProfileEdit } from "../pages/provider/provider-profile-edit";

// ============================================================================
// Route Paths
// ============================================================================

export const BOOKING_PATH = "/booking";
export const MY_BOOKINGS_PATH = "/my/bookings";
export const PROVIDER_DASHBOARD_PATH = "/provider/dashboard";
export const PROVIDER_SCHEDULE_PATH = "/provider/schedule";
export const PROVIDER_SESSIONS_PATH = "/provider/sessions";
export const PROVIDER_PROFILE_PATH = "/provider/profile";

// ============================================================================
// Public Routes
// ============================================================================

/** 상담사 탐색/검색 */
export const createBookingSearchRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/booking",
    component: BookingSearch,
  });

/** 상담사 상세 */
export const createProviderDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/booking/provider/$providerId",
    component: ProviderDetail,
  });

// ============================================================================
// Auth Routes (로그인 필요)
// ============================================================================

/** 예약 생성 */
export const createCreateBookingRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/booking/new",
    component: CreateBooking,
  });

/** 내 예약 목록 */
export const createMyBookingsRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/my/bookings",
    component: MyBookings,
  });

/** 예약 상세 */
export const createBookingDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/my/bookings/$bookingId",
    component: BookingDetail,
  });

// ============================================================================
// Provider Auth Routes (상담사 전용 - 로그인 필요)
// ============================================================================

/** 상담사 대시보드 */
export const createProviderDashboardRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/provider/dashboard",
    component: ProviderDashboard,
  });

/** 가용 시간 관리 */
export const createProviderScheduleRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/provider/schedule",
    component: ProviderSchedule,
  });

/** 세션 목록 */
export const createProviderSessionsRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/provider/sessions",
    component: ProviderSessions,
  });

/** 프로필 편집 */
export const createProviderProfileEditRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/provider/profile",
    component: ProviderProfileEdit,
  });

// ============================================================================
// Route Groups
// ============================================================================

/** Booking의 모든 Public Routes */
export function createBookingRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createBookingSearchRoute(parentRoute),
    createProviderDetailRoute(parentRoute),
  ];
}

/** Booking의 Auth Routes (고객 - 로그인 필요) */
export function createBookingAuthRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createCreateBookingRoute(parentRoute),
    createMyBookingsRoute(parentRoute),
    createBookingDetailRoute(parentRoute),
  ];
}

/** Booking의 Provider Auth Routes (상담사 - 로그인 필요) */
export function createBookingProviderRoutes<T extends AnyRoute>(
  parentRoute: T,
) {
  return [
    createProviderDashboardRoute(parentRoute),
    createProviderScheduleRoute(parentRoute),
    createProviderSessionsRoute(parentRoute),
    createProviderProfileEditRoute(parentRoute),
  ];
}
