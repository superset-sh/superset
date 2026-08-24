import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import { z } from "zod";

export const taskStatusEnumValues = [
	"backlog",
	"todo",
	"planning",
	"working",
	"needs-feedback",
	"ready-to-merge",
	"completed",
	"canceled",
] as const;
export const taskStatusEnum = z.enum(taskStatusEnumValues);
export type TaskStatus = z.infer<typeof taskStatusEnum>;

export const taskPriorityValues = [
	"urgent",
	"high",
	"medium",
	"low",
	"none",
] as const;
export const taskPriorityEnum = z.enum(taskPriorityValues);
export type TaskPriority = z.infer<typeof taskPriorityEnum>;

export const integrationProviderValues = [
	"linear",
	"github",
	"slack",
	// Added ahead of their connection flows so every provider agent branches
	// off one migration rather than each generating its own.
	"sentry",
	"microsoft_teams",
	"google",
	"notion",
] as const;
export const integrationProviderEnum = z.enum(integrationProviderValues);
export type IntegrationProvider = z.infer<typeof integrationProviderEnum>;

export const v2ClientTypeValues = ["desktop", "mobile", "web"] as const;
export const v2ClientTypeEnum = z.enum(v2ClientTypeValues);
export type V2ClientType = z.infer<typeof v2ClientTypeEnum>;

export const v2UsersHostRoleValues = ["owner", "member"] as const;
export const v2UsersHostRoleEnum = z.enum(v2UsersHostRoleValues);
export type V2UsersHostRole = z.infer<typeof v2UsersHostRoleEnum>;

export const commandStatusValues = [
	"pending",
	"completed",
	"failed",
	"timeout",
] as const;
export const commandStatusEnum = z.enum(commandStatusValues);
export type CommandStatus = z.infer<typeof commandStatusEnum>;

/**
 * No sleep/wake states: the provider wakes a sandbox on the first inbound
 * connection, so "asleep" is invisible to callers and could only ever be
 * reported stale. `ready` means addressable, awake or not.
 */
export const cloudWorkspaceStatusValues = [
	"provisioning",
	"ready",
	"failed",
	"deleted",
] as const;
export const cloudWorkspaceStatusEnum = z.enum(cloudWorkspaceStatusValues);
export type CloudWorkspaceStatus = z.infer<typeof cloudWorkspaceStatusEnum>;

export const workspaceTypeValues = ["local", "cloud"] as const;
export const workspaceTypeEnum = z.enum(workspaceTypeValues);
export type WorkspaceType = z.infer<typeof workspaceTypeEnum>;

export const v2WorkspaceTypeValues = ["main", "worktree"] as const;
export const v2WorkspaceTypeEnum = z.enum(v2WorkspaceTypeValues);
export type V2WorkspaceType = z.infer<typeof v2WorkspaceTypeEnum>;

export const automationRunStatusValues = [
	"dispatching",
	"dispatched",
	"skipped_offline",
	"dispatch_failed",
	"debounced",
	"rejected",
] as const;
export const automationRunStatusEnum = z.enum(automationRunStatusValues);
export type AutomationRunStatus = z.infer<typeof automationRunStatusEnum>;

export const automationSessionKindValues = ["chat", "terminal"] as const;
export const automationSessionKindEnum = z.enum(automationSessionKindValues);
export type AutomationSessionKind = z.infer<typeof automationSessionKindEnum>;

export const automationPromptSourceValues = [
	"human",
	"agent",
	"restore",
] as const;
export const automationPromptSourceEnum = z.enum(automationPromptSourceValues);
export type AutomationPromptSource = z.infer<typeof automationPromptSourceEnum>;

/**
 * Must list exactly the config kinds in `@superset/shared/automation-triggers`
 * — the `satisfies` below and the `_EveryKindHasEnumValue` check make either
 * direction of drift a compile error instead of a runtime cast.
 */
export const automationTriggerKindValues = [
	"schedule",
	"webhook",
	"github",
	"slack",
	"linear",
	"sentry",
	// Same reason as integrationProviderValues: one additive migration up
	// front, then every provider is a code-only change on top of it.
	"microsoft_teams",
	"google_calendar",
	"gmail",
	"notion",
	"circleback",
] as const satisfies readonly TriggerConfigInput["kind"][];

export type _EveryKindHasEnumValue = [
	Exclude<
		TriggerConfigInput["kind"],
		(typeof automationTriggerKindValues)[number]
	>,
] extends [never]
	? true
	: never;

export const automationTriggerKindEnum = z.enum(automationTriggerKindValues);
export type AutomationTriggerKind = z.infer<typeof automationTriggerKindEnum>;

// pgEnum columns; the wire/validation zod lives in @superset/shared/desktop-notices.
// platforms/channels are stored as text[] (no enum needed).
export const desktopNoticeSeverityValues = [
	"info",
	"warning",
	"blocking",
] as const;
export const desktopNoticeTriggerValues = [
	"immediate",
	"pre-update",
	"post-update",
] as const;
export const desktopNoticeCtaActionValues = [
	"install-update",
	"open-url",
] as const;

export const pageVisibilityValues = ["just_me", "org", "everyone"] as const;
export const pageVisibilityEnum = z.enum(pageVisibilityValues);
export type PageVisibility = z.infer<typeof pageVisibilityEnum>;

export const pageCommentAnchorKindValues = ["element", "text", "page"] as const;
export const pageCommentAnchorKindEnum = z.enum(pageCommentAnchorKindValues);
export type PageCommentAnchorKind = z.infer<typeof pageCommentAnchorKindEnum>;

export const pageCommentAuthorKindValues = ["human", "agent"] as const;
export const pageCommentAuthorKindEnum = z.enum(pageCommentAuthorKindValues);
export type PageCommentAuthorKind = z.infer<typeof pageCommentAuthorKindEnum>;
