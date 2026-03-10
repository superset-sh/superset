/**
 * Board Feature - Routes
 */
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { BoardListPage } from "./board-list-page";
import { PostListPage } from "./post-list-page";
import { PostDetailPage } from "./post-detail-page";
import { PostWritePage } from "./post-write-page";
import { PostEditPage } from "./post-edit-page";
// ============================================================================
// Route Paths
// ============================================================================

export const BOARD_PATH = "/board";

// ============================================================================
// Public Routes
// ============================================================================

/** 게시판 목록 */
export const createBoardListRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/board",
    component: BoardListPage,
  });

/** 게시판 글 목록 */
export const createPostListRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/board/$slug",
    component: PostListPage,
  });

/** 게시물 상세 */
export const createPostDetailRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/board/$slug/$postId",
    component: PostDetailPage,
  });

/** 글 작성 */
export const createPostWriteRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/board/$slug/write",
    component: PostWritePage,
  });

/** 글 수정 */
export const createPostEditRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/board/$slug/$postId/edit",
    component: PostEditPage,
  });

// ============================================================================
// Route Groups
// ============================================================================

/** Board의 모든 Public Routes */
export function createBoardRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createBoardListRoute(parentRoute),
    createPostListRoute(parentRoute),
    createPostDetailRoute(parentRoute),
    createPostWriteRoute(parentRoute),
    createPostEditRoute(parentRoute),
  ];
}
