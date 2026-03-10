/**
 * Story Studio Feature - Server
 */

// Module
export { StoryStudioModule } from "./story-studio.module";

// tRPC Router
export { storyStudioRouter, type StoryStudioRouter } from "./trpc";

// Services
export { ProjectService } from "./service/project.service";
export { ChapterService } from "./service/chapter.service";
export { GraphService } from "./service/graph.service";
export { FlagService } from "./service/flag.service";
export { DialogueService } from "./service/dialogue.service";
export { CharacterService } from "./service/character.service";

// Export Types
export type {
  StoryStudioExport,
  ExportBeat,
  ExportEnding,
  ExportEvent,
} from "./service/export.service";
export type { ProjectValidationResult } from "./service/validation.service";

// Additional Services
export { ValidationService } from "./service/validation.service";

// Phase 1 Services
export { BeatService } from "./service/beat.service";
export { EndingService } from "./service/ending.service";
export { EventService } from "./service/event.service";

// Schema - centralized in @superbuilder/drizzle
// Use: import { storyStudioProjects, storyStudioChapters, ... } from "@superbuilder/drizzle"
