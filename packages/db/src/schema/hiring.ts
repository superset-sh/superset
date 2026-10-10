import { desc } from "drizzle-orm";
import {
	date,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import {
	hiringEventKindValues,
	hiringOutcomeValues,
	hiringRoleStatusValues,
	hiringScoreValues,
	hiringSourceValues,
	hiringStageValues,
} from "./enums";

export const hiringRoleStatus = pgEnum(
	"hiring_role_status",
	hiringRoleStatusValues,
);
export const hiringSource = pgEnum("hiring_source", hiringSourceValues);
export const hiringStage = pgEnum("hiring_stage", hiringStageValues);
export const hiringOutcome = pgEnum("hiring_outcome", hiringOutcomeValues);
export const hiringScore = pgEnum("hiring_score", hiringScoreValues);
export const hiringEventKind = pgEnum(
	"hiring_event_kind",
	hiringEventKindValues,
);

export const hiringRoles = pgTable(
	"hiring_roles",
	{
		id: uuid().primaryKey().defaultRandom(),
		title: text().notNull(),
		status: hiringRoleStatus().notNull().default("open"),
		waasJobId: text("waas_job_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [uniqueIndex("hiring_roles_title_unique").on(table.title)],
);

export type SelectHiringRole = typeof hiringRoles.$inferSelect;

export const hiringCandidates = pgTable(
	"hiring_candidates",
	{
		id: uuid().primaryKey().defaultRandom(),
		name: text().notNull(),
		email: text(),
		phone: text(),
		currentTitle: text("current_title"),
		currentCompany: text("current_company"),
		githubUrl: text("github_url"),
		linkedinUrl: text("linkedin_url"),
		xUrl: text("x_url"),
		siteUrl: text("site_url"),
		waasUrl: text("waas_url"),
		supersetUserId: uuid("superset_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		source: hiringSource(),
		referredBy: text("referred_by"),
		notionPageId: text("notion_page_id"),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("hiring_candidates_email_unique").on(table.email),
		uniqueIndex("hiring_candidates_notion_page_id_unique").on(
			table.notionPageId,
		),
		index("hiring_candidates_github_url_idx").on(table.githubUrl),
	],
);

export type InsertHiringCandidate = typeof hiringCandidates.$inferInsert;
export type SelectHiringCandidate = typeof hiringCandidates.$inferSelect;

export const hiringApplications = pgTable(
	"hiring_applications",
	{
		id: uuid().primaryKey().defaultRandom(),
		candidateId: uuid("candidate_id")
			.notNull()
			.references(() => hiringCandidates.id, { onDelete: "cascade" }),
		roleId: uuid("role_id")
			.notNull()
			.references(() => hiringRoles.id, { onDelete: "restrict" }),
		stage: hiringStage().notNull().default("sourced"),
		outcome: hiringOutcome().notNull().default("active"),
		score: hiringScore(),
		ownerUserId: uuid("owner_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		nextStep: text("next_step"),
		nextFollowUpOn: date("next_follow_up_on"),
		lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
		stageChangedAt: timestamp("stage_changed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		closedAt: timestamp("closed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("hiring_applications_candidate_role_unique").on(
			table.candidateId,
			table.roleId,
		),
		index("hiring_applications_outcome_follow_up_idx").on(
			table.outcome,
			table.nextFollowUpOn,
		),
	],
);

export type SelectHiringApplication = typeof hiringApplications.$inferSelect;

export interface HiringEventMetadata {
	fromStage?: string;
	toStage?: string;
	fromOutcome?: string;
	toOutcome?: string;
	score?: string;
	interviewer?: string;
	round?: string;
	gmailThreadId?: string;
}

export const hiringEvents = pgTable(
	"hiring_events",
	{
		id: uuid().primaryKey().defaultRandom(),
		candidateId: uuid("candidate_id")
			.notNull()
			.references(() => hiringCandidates.id, { onDelete: "cascade" }),
		applicationId: uuid("application_id").references(
			() => hiringApplications.id,
			{ onDelete: "cascade" },
		),
		kind: hiringEventKind().notNull(),
		body: text(),
		metadata: jsonb().$type<HiringEventMetadata>(),
		authorUserId: uuid("author_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		authorLabel: text("author_label"),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("hiring_events_candidate_occurred_at_idx").on(
			table.candidateId,
			desc(table.occurredAt),
		),
		index("hiring_events_kind_occurred_at_idx").on(
			table.kind,
			table.occurredAt,
		),
	],
);

export type SelectHiringEvent = typeof hiringEvents.$inferSelect;
