import { createRoute } from "@tanstack/react-router";
import { SignUpForm } from "../pages";

function SignUpPage() {
  return <SignUpForm />;
}

/**
 * Sign Up Route
 * @param rootRoute - App의 rootRoute를 전달받아 연결
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createSignUpRoute = (rootRoute: any) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-up",
    component: SignUpPage,
  });
