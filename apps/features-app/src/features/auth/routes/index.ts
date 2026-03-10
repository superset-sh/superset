import { createSignInRoute } from "./sign-in";
import { createSignUpRoute } from "./sign-up";

export { createSignInRoute } from "./sign-in";
export { createSignUpRoute } from "./sign-up";

/**
 * Auth Feature의 모든 Public Routes 생성
 *
 * @example
 * ```tsx
 * // apps/app/src/router.tsx
 * import { createAuthRoutes } from "./features/auth";
 *
 * const routeTree = rootRoute.addChildren([
 *   indexRoute,
 *   ...createAuthRoutes(rootRoute),
 * ]);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAuthRoutes(rootRoute: any) {
  return [createSignInRoute(rootRoute), createSignUpRoute(rootRoute)];
}
