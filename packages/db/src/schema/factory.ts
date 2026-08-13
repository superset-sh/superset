import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";
import {
	factoryItemSourceValues,
	factoryPromptAuthorValues,
	factoryPromptStatusValues,
	factoryRunOutcomeValues,
	factoryRunStatusValues,
	factoryStageValues,
} from "./enums";
import { automationSessionKind, tasks } from "./schema";

export const factoryItemSource = pgEnum(
	"factory_item_source",
	factoryItemSourceValues,
);
export const factoryStage = pgEnum("factory_stage", factoryStageValues);
export const factoryRunStatus = pgEnum(
	"factory_run_status",
	factoryRunStatusValues,
);
export const factoryRunOutcome = pgEnum(
	"factory_run_outcome",
	factoryRunOutcomeValues,
);
export const factoryPromptStatus = pgEnum(
	"factory_prompt_status",
	factoryPromptStatusValues,
);
export const factoryPromptAuthor = pgEnum(
	"factory_prompt_author",
	factoryPromptAuthorValues,
);

/** Per-stage agent override; falls back to factories.defaultAgent. */
export interface FactoryStageConfig {
	agent?: string;
	model?: string;
}

/**
 * A factory is an issue→PR pipeline over one repo (v2 project). Stage
 * execution reuses the automation dispatch path: workspace + agent session
 * on one of the owner's hosts.
 */
export const factories = pgTable(
	"factories",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		name: text().notNull(),
		// Host-side project the stage workspaces are created in.
		v2ProjectId: uuid("v2_project_id").notNull(),
		// "owner/repo" — GitHub identity of the project, for intake + PR links.
		repoFullName: text("repo_full_name").notNull(),
		targetHostId: text("target_host_id"),

		defaultAgent: text("default_agent").notNull(),
		stageConfig: jsonb("stage_config")
			.$type<Partial<Record<string, FactoryStageConfig>>>()
			.notNull()
			.default({}),

		enabled: boolean().notNull().default(true),
		// Successful stage reports (and webhook intake) dispatch the next
		// stage automatically; off = a human presses Run between stages.
		autoAdvance: boolean("auto_advance").notNull().default(false),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("factories_organization_idx").on(t.organizationId)],
);

export type InsertFactory = typeof factories.$inferInsert;
export type SelectFactory = typeof factories.$inferSelect;

/**
 * One unit of work moving through the pipeline. Mutable spine: `stage` is
 * where it is, `revision` is the CAS counter every write bumps. What
 * happened lives in factory_runs (append-only).
 */
export const factoryItems = pgTable(
	"factory_items",
	{
		id: uuid().primaryKey().defaultRandom(),
		factoryId: uuid("factory_id")
			.notNull()
			.references(() => factories.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		source: factoryItemSource().notNull(),
		externalNumber: integer("external_number").notNull(),
		externalUrl: text("external_url").notNull(),
		title: text().notNull(),
		authorLogin: text("author_login"),

		// Idempotent intake: webhook and poll compute the same key; the loser
		// of the insert race no-ops.
		materializationKey: text("materialization_key").notNull(),

		stage: factoryStage().notNull().default("intake"),
		revision: integer().notNull().default(0),
		// Deliberately not a stage: the item stays where it wedged so
		// stage-age metrics show where the pipeline stalls.
		blockedReason: text("blocked_reason"),

		// Latest classification, copied up from the classify run for board
		// filtering. Full result stays in the run's resultJson.
		kind: text(),
		confidence: integer(),

		prNumber: integer("pr_number"),
		prUrl: text("pr_url"),
		taskId: uuid("task_id").references(() => tasks.id, {
			onDelete: "set null",
		}),

		stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("factory_items_materialization_idx").on(
			t.factoryId,
			t.materializationKey,
		),
		index("factory_items_board_idx").on(t.factoryId, t.stage),
		index("factory_items_organization_idx").on(t.organizationId),
	],
);

export type InsertFactoryItem = typeof factoryItems.$inferInsert;
export type SelectFactoryItem = typeof factoryItems.$inferSelect;

/**
 * The evidence ledger: one row per stage execution (agent dispatch) or
 * human action (outcome "manual"). Mirrors automation_runs for the
 * dispatch/session pointers so run deep-links reuse that machinery.
 */
export const factoryRuns = pgTable(
	"factory_runs",
	{
		id: uuid().primaryKey().defaultRandom(),
		itemId: uuid("item_id")
			.notNull()
			.references(() => factoryItems.id, { onDelete: "cascade" }),
		factoryId: uuid("factory_id")
			.notNull()
			.references(() => factories.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		stage: factoryStage().notNull(),
		attempt: integer().notNull().default(1),
		promptVersionId: uuid("prompt_version_id"),

		hostId: text("host_id"),
		v2WorkspaceId: uuid("v2_workspace_id"),
		sessionKind: automationSessionKind("session_kind"),
		terminalSessionId: text("terminal_session_id"),
		chatSessionId: uuid("chat_session_id"),

		status: factoryRunStatus().notNull(),
		outcome: factoryRunOutcome(),
		resultJson: jsonb("result_json").$type<unknown>(),
		rationale: text(),
		error: text(),
		feedbackNote: text("feedback_note"),
		// Set on human-actor rows (manual transitions, feedback).
		actorUserId: uuid("actor_user_id").references(() => users.id, {
			onDelete: "set null",
		}),

		dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
		reportedAt: timestamp("reported_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("factory_runs_attempt_idx").on(t.itemId, t.stage, t.attempt),
		index("factory_runs_item_idx").on(t.itemId, t.createdAt),
		index("factory_runs_stage_idx").on(t.factoryId, t.stage),
		index("factory_runs_workspace_idx").on(t.v2WorkspaceId),
	],
);

export type InsertFactoryRun = typeof factoryRuns.$inferInsert;
export type SelectFactoryRun = typeof factoryRuns.$inferSelect;

/**
 * Versioned per-stage prompts. Exactly one active version per
 * (factory, stage); improve runs author drafts a human activates.
 */
export const factoryStagePrompts = pgTable(
	"factory_stage_prompts",
	{
		id: uuid().primaryKey().defaultRandom(),
		factoryId: uuid("factory_id")
			.notNull()
			.references(() => factories.id, { onDelete: "cascade" }),

		stage: factoryStage().notNull(),
		version: integer().notNull(),
		content: text().notNull(),

		status: factoryPromptStatus().notNull().default("draft"),
		authoredBy: factoryPromptAuthor("authored_by").notNull(),
		authorUserId: uuid("author_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		// Flawed runs that prompted this revision (improve-run provenance).
		sourceRunIds: jsonb("source_run_ids")
			.$type<string[]>()
			.notNull()
			.default([]),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("factory_stage_prompts_version_idx").on(
			t.factoryId,
			t.stage,
			t.version,
		),
		uniqueIndex("factory_stage_prompts_active_idx")
			.on(t.factoryId, t.stage)
			.where(sql`${t.status} = 'active'`),
	],
);

export type InsertFactoryStagePrompt = typeof factoryStagePrompts.$inferInsert;
export type SelectFactoryStagePrompt = typeof factoryStagePrompts.$inferSelect;

/**
 * Improve meta-agent runs: factory+stage scoped (not item scoped). The
 * meta-agent reads flawed runs and proposes a draft prompt version via the
 * factory_propose_prompt MCP tool; a human activates it.
 */
export const factoryImproveRuns = pgTable(
	"factory_improve_runs",
	{
		id: uuid().primaryKey().defaultRandom(),
		factoryId: uuid("factory_id")
			.notNull()
			.references(() => factories.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		stage: factoryStage().notNull(),
		// Flawed runs the meta-agent was given.
		sourceRunIds: jsonb("source_run_ids")
			.$type<string[]>()
			.notNull()
			.default([]),

		hostId: text("host_id"),
		v2WorkspaceId: uuid("v2_workspace_id"),
		sessionKind: automationSessionKind("session_kind"),
		terminalSessionId: text("terminal_session_id"),
		chatSessionId: uuid("chat_session_id"),

		status: factoryRunStatus().notNull(),
		proposedPromptVersionId: uuid("proposed_prompt_version_id").references(
			() => factoryStagePrompts.id,
			{ onDelete: "set null" },
		),
		rationale: text(),
		error: text(),

		dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
		reportedAt: timestamp("reported_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("factory_improve_runs_stage_idx").on(
			t.factoryId,
			t.stage,
			t.createdAt,
		),
	],
);

export type InsertFactoryImproveRun = typeof factoryImproveRuns.$inferInsert;
export type SelectFactoryImproveRun = typeof factoryImproveRuns.$inferSelect;
