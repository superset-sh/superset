import { createProfileRoute } from './profile';
import { createProfileEditRoute } from './profile-edit';

export { createProfileRoute } from './profile';
export { createProfileEditRoute } from './profile-edit';

/**
 * Profile Feature의 Auth Routes 생성 (인증 필요)
 * AdminLayout 하위에 추가됨
 *
 * @example
 * ```tsx
 * // apps/app/src/router.tsx
 * import { createProfileAuthRoutes } from "./features/profile";
 *
 * adminLayoutRoute.addChildren([
 *   ...createProfileAuthRoutes(adminLayoutRoute),
 * ]);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createProfileAuthRoutes(parentRoute: any) {
  return [createProfileRoute(parentRoute), createProfileEditRoute(parentRoute)];
}
