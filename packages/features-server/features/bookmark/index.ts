// Module
export { BookmarkModule } from "./bookmark.module";

// Controller
export { BookmarkController } from "./controller";

// tRPC Router
export { bookmarkRouter } from "./trpc";
export type { BookmarkRouter } from "./trpc";

// Services
export { BookmarkService } from "./service";

// Schema - centralized in @superbuilder/drizzle
// Use: import { bookmarks } from "@superbuilder/drizzle"
