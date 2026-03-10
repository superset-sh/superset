// Module
export { ReactionModule } from "./reaction.module";

// Controller
export { ReactionController } from "./controller";

// tRPC Router
export { reactionRouter } from "./trpc";
export type { ReactionRouter } from "./trpc";

// Services
export { ReactionService } from "./service";

// Schema - now centralized in @superbuilder/drizzle
// Use: import { reactions } from "@superbuilder/drizzle"
