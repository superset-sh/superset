import { createRoute } from "@tanstack/react-router";
import { AdminSignInForm } from "../../pages";

function AdminLoginPage() {
  return <AdminSignInForm />;
}

/**
 * Admin Login Route
 * @param parentRoute - Admin layout route 또는 rootRoute를 전달받아 연결
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createAdminLoginRoute = (parentRoute: any) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/login",
    component: AdminLoginPage,
  });
