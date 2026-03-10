/**
 * Family Feature - Routes
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { FamilyGroups } from "../pages/family-groups";
import { FamilyGroupDetail } from "../pages/family-group-detail";
import { FamilyChildDetail } from "../pages/family-child-detail";
import { FamilyInvite } from "../pages/family-invite";

// ============================================================================
// Route Paths
// ============================================================================

export const FAMILY_PATH = "/family";
export const FAMILY_GROUP_PATH = "/family/$groupId";
export const FAMILY_CHILD_PATH = "/family/child/$childId";
export const FAMILY_INVITE_PATH = "/family/invite";

// ============================================================================
// Auth Routes (로그인 필요 — 모든 가족 기능은 인증 필수)
// ============================================================================

/** 가족 그룹 목록 */
export const createFamilyGroupsRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/family",
    component: FamilyGroups,
  });

/** 가족 그룹 상세 */
export const createFamilyGroupDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/family/$groupId",
    component: FamilyGroupDetail,
  });

/** 아이 상세 */
export const createFamilyChildDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/family/child/$childId",
    component: FamilyChildDetail,
    validateSearch: (search: Record<string, unknown>) => ({
      groupId: (search.groupId as string) || undefined,
    }),
  });

/** 초대 수락/거절 */
export const createFamilyInviteRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/family/invite",
    component: FamilyInvite,
    validateSearch: (search: Record<string, unknown>) => ({
      token: (search.token as string) || undefined,
    }),
  });

// ============================================================================
// Route Groups
// ============================================================================

/** Family의 Auth Routes (모든 가족 기능은 인증 필요) */
export function createFamilyAuthRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createFamilyGroupsRoute(parentRoute),
    createFamilyGroupDetailRoute(parentRoute),
    createFamilyChildDetailRoute(parentRoute),
    createFamilyInviteRoute(parentRoute),
  ];
}
