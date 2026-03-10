/**
 * Board Feature - Server
 */

// Module
export { BoardModule } from "./board.module";

// tRPC Router
export { boardRouter, type BoardRouter } from "./trpc";

// Services
export { BoardService, PostService } from "./service";

// Types
export * from "./types";

// Schema - now centralized in @superbuilder/drizzle
// Use: import { boards, boardPosts } from "@superbuilder/drizzle"
