/**
 * Course Feature - Server
 */

// Module
export { CourseModule } from "./course.module";

// tRPC Router
export { courseRouter, type CourseRouter } from "./trpc";

// Services
export {
  TopicService,
  CourseService,
  SectionService,
  LessonService,
  EnrollmentService,
  AttachmentService,
} from "./service";

// Types
export * from "./types";

// Schema - now centralized in @superbuilder/drizzle
// Use: import { courseTopics, courseCourses, ... } from "@superbuilder/drizzle"
