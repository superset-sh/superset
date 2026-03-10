import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { CouponListPage, CouponDetailPage } from "./pages";

export const COUPON_ADMIN_PATH = "/coupon";
export const COUPON_ADMIN_DETAIL_PATH = "/coupon/$couponId";

export function createCouponAdminRoutes(parentRoute: AnyRoute) {
  const listRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: "/coupon",
    component: CouponListPage,
  });

  const detailRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: "/coupon/$couponId",
    component: CouponDetailPage,
  });

  return [listRoute, detailRoute];
}
