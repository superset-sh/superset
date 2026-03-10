import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { RegistrationInfo } from "../pages/registration-info";
import { RegistrationTerms } from "../pages/registration-terms";
import { RegistrationConfirm } from "../pages/registration-confirm";
import { RegistrationComplete } from "../pages/registration-complete";

// ============================================================================
// Route Paths
// ============================================================================

export const REGISTRATION_PATH = "/register";
export const REGISTRATION_TERMS_PATH = "/register/terms";
export const REGISTRATION_CONFIRM_PATH = "/register/confirm";
export const REGISTRATION_COMPLETE_PATH = "/register/complete";

// ============================================================================
// Route Creators
// ============================================================================

export const createRegistrationInfoRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/register",
    component: RegistrationInfo,
  });

export const createRegistrationTermsRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/register/terms",
    component: RegistrationTerms,
  });

export const createRegistrationConfirmRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/register/confirm",
    component: RegistrationConfirm,
  });

export const createRegistrationCompleteRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/register/complete",
    component: RegistrationComplete,
  });

// ============================================================================
// Route Group
// ============================================================================

export function createMobileRegistrationRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createRegistrationInfoRoute(parentRoute),
    createRegistrationTermsRoute(parentRoute),
    createRegistrationConfirmRoute(parentRoute),
    createRegistrationCompleteRoute(parentRoute),
  ];
}
