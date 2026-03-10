// packages/drizzle/src/schema/features/story-studio/index.ts
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns, baseColumnsWithSoftDelete } from "../../../utils";
import { profiles } from "../../core/profiles";

// ============================================================================
// Enums
// ============================================================================

export const storyStudioProjectStatusEnum = pgEnum("story_studio_project_status", [
  "active",
  "archived",
]);

export const storyStudioChapterStatusEnum = pgEnum("story_studio_chapter_status", [
  "outline",
  "draft",
  "review",
  "final",
  "locked",
]);

export const storyStudioGraphNodeTypeEnum = pgEnum("story_studio_graph_node_type", [
  "start",
  "scene",
  "choice",
  "condition",
  "merge",
  "end",
]);

export const storyStudioFlagTypeEnum = pgEnum("story_studio_flag_type", [
  "boolean",
  "number",
  "string",
  "enum",
]);

export const storyStudioFlagCategoryEnum = pgEnum("story_studio_flag_category", [
  "character",
  "quest",
  "world",
  "system",
]);

export const storyStudioDialogueTypeEnum = pgEnum("story_studio_dialogue_type", [
  "dialogue",
  "narration",
  "monologue",
  "system",
  "choice_text",
  "direction",
]);

export const storyStudioCharacterRoleEnum = pgEnum("story_studio_character_role", [
  "protagonist",
  "antagonist",
  "supporting",
  "npc",
  "mob",
]);

// --- Phase 1 Enums ---

export const storyStudioActEnum = pgEnum("story_studio_act", [
  "act_1",
  "act_2a",
  "act_2b",
  "act_3",
]);

export const storyStudioBeatTypeEnum = pgEnum("story_studio_beat_type", [
  "opening_image",
  "setup",
  "theme_stated",
  "catalyst",
  "debate",
  "break_into_two",
  "b_story",
  "fun_and_games",
  "midpoint",
  "bad_guys_close_in",
  "all_is_lost",
  "dark_night",
  "break_into_three",
  "finale",
  "final_image",
  "climax",
  "resolution",
  "custom",
]);

export const storyStudioEmotionalToneEnum = pgEnum("story_studio_emotional_tone", [
  "hope",
  "despair",
  "tension",
  "relief",
  "mystery",
  "joy",
  "sorrow",
  "anger",
  "fear",
  "neutral",
]);

export const storyStudioBeatTemplateStructureEnum = pgEnum("story_studio_beat_template_structure", [
  "save_the_cat",
  "three_act",
  "hero_journey",
  "custom",
]);

export const storyStudioEndingTypeEnum = pgEnum("story_studio_ending_type", [
  "true_end",
  "normal_end",
  "bad_end",
  "hidden_end",
  "secret_end",
]);

export const storyStudioDifficultyEnum = pgEnum("story_studio_difficulty", [
  "easy",
  "normal",
  "hard",
  "very_hard",
]);

export const storyStudioEventTypeEnum = pgEnum("story_studio_event_type", [
  "item_acquire",
  "location_visit",
  "battle_result",
  "npc_talk",
  "quest_complete",
  "custom",
]);

// ============================================================================
// Types (JSONB column types)
// ============================================================================

export type StoryStudioCondition = {
  type: "flag_check" | "group";
  flagId?: string;
  operator?: "==" | "!=" | ">" | ">=" | "<" | "<=";
  value?: string | number | boolean;
  logic?: "AND" | "OR";
  children?: StoryStudioCondition[];
};

export type StoryStudioEffect = {
  flagId: string;
  operation: "set" | "add" | "subtract" | "toggle" | "multiply";
  value: string | number | boolean;
};

export type StoryStudioSystemVariables = {
  name: string;
  type: string;
  defaultValue: string;
}[];

// --- Phase 1 Types ---

export type StoryStudioBeatSlot = {
  beatType: string;
  act: string;
  label: string;
  description: string;
};

// ============================================================================
// Tables — Phase 0
// ============================================================================

// --- Projects ---
export const storyStudioProjects = pgTable("story_studio_projects", {
  ...baseColumnsWithSoftDelete(),
  title: varchar("title", { length: 200 }).notNull(),
  genre: varchar("genre", { length: 100 }),
  description: text("description"),
  systemVariables: jsonb("system_variables").$type<StoryStudioSystemVariables>().default([]),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  status: storyStudioProjectStatusEnum("status").notNull().default("active"),
});

// --- Chapters ---
export const storyStudioChapters = pgTable("story_studio_chapters", {
  ...baseColumnsWithSoftDelete(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => storyStudioProjects.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  order: integer("order").notNull().default(0),
  summary: text("summary"),
  status: storyStudioChapterStatusEnum("status").notNull().default("outline"),
  estimatedPlaytime: varchar("estimated_playtime", { length: 50 }),
});

// --- GraphNodes ---
export const storyStudioGraphNodes = pgTable("story_studio_graph_nodes", {
  ...baseColumns(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => storyStudioProjects.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id")
    .notNull()
    .references(() => storyStudioChapters.id, { onDelete: "cascade" }),
  type: storyStudioGraphNodeTypeEnum("type").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  positionX: real("position_x").notNull().default(0),
  positionY: real("position_y").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

// --- GraphEdges ---
export const storyStudioGraphEdges = pgTable("story_studio_graph_edges", {
  ...baseColumns(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => storyStudioProjects.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id")
    .notNull()
    .references(() => storyStudioChapters.id, { onDelete: "cascade" }),
  sourceNodeId: uuid("source_node_id")
    .notNull()
    .references(() => storyStudioGraphNodes.id, { onDelete: "cascade" }),
  targetNodeId: uuid("target_node_id")
    .notNull()
    .references(() => storyStudioGraphNodes.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 200 }),
  conditions: jsonb("conditions").$type<StoryStudioCondition[]>().default([]),
  effects: jsonb("effects").$type<StoryStudioEffect[]>().default([]),
  order: integer("order").notNull().default(0),
});

// --- Flags ---
export const storyStudioFlags = pgTable("story_studio_flags", {
  ...baseColumns(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => storyStudioProjects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  type: storyStudioFlagTypeEnum("type").notNull().default("boolean"),
  defaultValue: varchar("default_value", { length: 200 }),
  category: storyStudioFlagCategoryEnum("category").notNull().default("quest"),
  description: text("description"),
  isInterpolatable: boolean("is_interpolatable").notNull().default(false),
});

// --- Characters ---
export const storyStudioCharacters = pgTable("story_studio_characters", {
  ...baseColumns(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => storyStudioProjects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  role: storyStudioCharacterRoleEnum("role").notNull().default("npc"),
  personality: text("personality"),
  speechStyle: text("speech_style"),
});

// --- Dialogues ---
export const storyStudioDialogues = pgTable("story_studio_dialogues", {
  ...baseColumnsWithSoftDelete(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => storyStudioProjects.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id")
    .notNull()
    .references(() => storyStudioChapters.id, { onDelete: "cascade" }),
  branchNodeId: uuid("branch_node_id")
    .notNull()
    .references(() => storyStudioGraphNodes.id, { onDelete: "cascade" }),
  type: storyStudioDialogueTypeEnum("type").notNull().default("dialogue"),
  speakerId: uuid("speaker_id").references(() => storyStudioCharacters.id, {
    onDelete: "set null",
  }),
  emotion: varchar("emotion", { length: 50 }),
  content: text("content").notNull(),
  direction: text("direction"),
  timing: varchar("timing", { length: 20 }),
  voiceNote: text("voice_note"),
  tags: jsonb("tags").$type<string[]>().default([]),
  stringId: varchar("string_id", { length: 100 }).notNull(),
  order: integer("order").notNull().default(0),
});

// ============================================================================
// Tables — Phase 1
// ============================================================================

// --- BeatTemplates (프리셋 먼저 정의 — Beats에서 FK 참조) ---
export const storyStudioBeatTemplates = pgTable("story_studio_beat_templates", {
  ...baseColumns(),
  name: varchar("name", { length: 100 }).notNull(),
  structure: storyStudioBeatTemplateStructureEnum("structure").notNull(),
  beats: jsonb("beats").$type<StoryStudioBeatSlot[]>().notNull().default([]),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
});

// --- Beats ---
export const storyStudioBeats = pgTable("story_studio_beats", {
  ...baseColumns(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => storyStudioProjects.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id")
    .notNull()
    .references(() => storyStudioChapters.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  act: storyStudioActEnum("act").notNull().default("act_1"),
  beatType: storyStudioBeatTypeEnum("beat_type").notNull().default("custom"),
  summary: text("summary"),
  emotionalTone: storyStudioEmotionalToneEnum("emotional_tone"),
  characters: jsonb("characters").$type<string[]>().default([]),
  location: varchar("location", { length: 200 }),
  purpose: text("purpose"),
  linkedNodes: jsonb("linked_nodes").$type<string[]>().default([]),
  order: integer("order").notNull().default(0),
});

// --- Endings ---
export const storyStudioEndings = pgTable("story_studio_endings", {
  ...baseColumns(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => storyStudioProjects.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  type: storyStudioEndingTypeEnum("type").notNull().default("normal_end"),
  description: text("description"),
  requiredFlags: jsonb("required_flags").$type<StoryStudioCondition[]>().default([]),
  graphNodeId: uuid("graph_node_id").references(() => storyStudioGraphNodes.id, {
    onDelete: "set null",
  }),
  difficulty: storyStudioDifficultyEnum("difficulty").notNull().default("normal"),
  discoveryHint: text("discovery_hint"),
});

// --- Events ---
export const storyStudioEvents = pgTable("story_studio_events", {
  ...baseColumns(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => storyStudioProjects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  type: storyStudioEventTypeEnum("type").notNull().default("custom"),
  description: text("description"),
  effects: jsonb("effects").$type<StoryStudioEffect[]>().default([]),
  triggeredNodes: jsonb("triggered_nodes").$type<string[]>().default([]),
});

// ============================================================================
// Type Exports
// ============================================================================

export type StoryStudioProject = typeof storyStudioProjects.$inferSelect;
export type NewStoryStudioProject = typeof storyStudioProjects.$inferInsert;

export type StoryStudioChapter = typeof storyStudioChapters.$inferSelect;
export type NewStoryStudioChapter = typeof storyStudioChapters.$inferInsert;

export type StoryStudioGraphNode = typeof storyStudioGraphNodes.$inferSelect;
export type NewStoryStudioGraphNode = typeof storyStudioGraphNodes.$inferInsert;

export type StoryStudioGraphEdge = typeof storyStudioGraphEdges.$inferSelect;
export type NewStoryStudioGraphEdge = typeof storyStudioGraphEdges.$inferInsert;

export type StoryStudioFlag = typeof storyStudioFlags.$inferSelect;
export type NewStoryStudioFlag = typeof storyStudioFlags.$inferInsert;

export type StoryStudioCharacter = typeof storyStudioCharacters.$inferSelect;
export type NewStoryStudioCharacter = typeof storyStudioCharacters.$inferInsert;

export type StoryStudioDialogue = typeof storyStudioDialogues.$inferSelect;
export type NewStoryStudioDialogue = typeof storyStudioDialogues.$inferInsert;

// Phase 1
export type StoryStudioBeatTemplate = typeof storyStudioBeatTemplates.$inferSelect;
export type NewStoryStudioBeatTemplate = typeof storyStudioBeatTemplates.$inferInsert;

export type StoryStudioBeat = typeof storyStudioBeats.$inferSelect;
export type NewStoryStudioBeat = typeof storyStudioBeats.$inferInsert;

export type StoryStudioEnding = typeof storyStudioEndings.$inferSelect;
export type NewStoryStudioEnding = typeof storyStudioEndings.$inferInsert;

export type StoryStudioEvent = typeof storyStudioEvents.$inferSelect;
export type NewStoryStudioEvent = typeof storyStudioEvents.$inferInsert;
