// Comment Feature - Server exports
export { CommentModule } from "./comment.module";
export { CommentService } from "./service";
export { commentRouter, type CommentRouter } from "./trpc";

// Schema - now centralized in @superbuilder/drizzle
// Use: import { comments } from "@superbuilder/drizzle"
