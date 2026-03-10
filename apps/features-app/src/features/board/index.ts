/**
 * Board Feature - Client
 */

// Routes
export {
  BOARD_PATH,
  createBoardRoutes,
  createBoardListRoute,
  createPostListRoute,
  createPostDetailRoute,
  createPostWriteRoute,
  createPostEditRoute,
} from "./routes";

// UI - Pages
export { BoardList, PostList, PostDetail, PostEditor, BoardManager } from "./pages";

// Hooks
export {
  useBoards,
  useBoardBySlug,
  useBoardById,
  usePosts,
  usePost,
  useCreatePost,
  useUpdatePost,
  useDeletePost,
} from "./hooks";

// Types
export type * from "./types";
