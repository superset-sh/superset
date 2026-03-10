/**
 * Task Feature - Server
 */

// Module
export { TaskModule } from "./task.module";

// tRPC Router
export { taskRouter, type TaskRouter } from "./trpc";

// Services
export {
  TaskService,
  TaskActivityService,
  TaskProjectService,
  TaskCycleService,
  TaskLabelService,
  TaskCommentService,
} from "./service";

// Types
export * from "./types";

// Schema - centralized in @superbuilder/drizzle
// Use: import { taskTasks, taskProjects, ... } from "@superbuilder/drizzle"
