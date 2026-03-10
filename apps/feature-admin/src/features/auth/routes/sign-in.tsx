import { createRoute } from "@tanstack/react-router";
import { SignInForm } from "../pages";

function SignInPage() {
  return <SignInForm />;
}

/**
 * Sign In Route
 * @param rootRoute - App의 rootRoute를 전달받아 연결
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createSignInRoute = (rootRoute: any) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    component: SignInPage,
  });
