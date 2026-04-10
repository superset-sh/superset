import type { WorkspaceState } from "@superset/panes";
import { z } from "zod";

const persistedDateSchema = z
	.union([z.string(), z.date()])
	.transform((value) => (typeof value === "string" ? new Date(value) : value));

export const dashboardSidebarProjectSchema = z.object({
	projectId: z.string().uuid(),
	createdAt: persistedDateSchema,
	isCollapsed: z.boolean().default(false),
	tabOrder: z.number().int().default(0),
});

const paneWorkspaceStateSchema = z.custom<WorkspaceState<unknown>>();

const changesFilterSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("all") }),
	z.object({ kind: z.literal("uncommitted") }),
	z.object({ kind: z.literal("commit"), hash: z.string() }),
	z.object({
		kind: z.literal("range"),
		fromHash: z.string(),
		toHash: z.string(),
	}),
]);

export type ChangesFilter = z.infer<typeof changesFilterSchema>;

export const workspaceLocalStateSchema = z.object({
	workspaceId: z.string().uuid(),
	createdAt: persistedDateSchema,
	sidebarState: z.object({
		projectId: z.string().uuid(),
		tabOrder: z.number().int().default(0),
		sectionId: z.string().uuid().nullable().default(null),
		changesFilter: changesFilterSchema.default({ kind: "all" }),
		baseBranch: z.string().nullable().default(null),
	}),
	paneLayout: paneWorkspaceStateSchema,
	rightSidebarOpen: z.boolean().default(false),
	defaultOpenInApp: z.string().nullable().default(null),
});

export const dashboardSidebarSectionSchema = z.object({
	sectionId: z.string().uuid(),
	projectId: z.string().uuid(),
	name: z.string().trim().min(1),
	createdAt: persistedDateSchema,
	tabOrder: z.number().int().default(0),
	isCollapsed: z.boolean().default(false),
	color: z.string().nullable().default(null),
});

const v2ExecutionModeSchema = z.enum([
	"split-pane",
	"new-tab",
	"new-tab-split-pane",
]);

// projectIds uses plain z.string() (not uuid) because v1 accepts arbitrary
// string IDs and the migration copies them verbatim.
export const v2TerminalPresetSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	description: z.string().optional(),
	cwd: z.string().default(""),
	commands: z.array(z.string()).default([]),
	projectIds: z.array(z.string()).nullable().default(null),
	pinnedToBar: z.boolean().optional(),
	applyOnWorkspaceCreated: z.boolean().optional(),
	applyOnNewTab: z.boolean().optional(),
	executionMode: v2ExecutionModeSchema.default("new-tab"),
	tabOrder: z.number().int().default(0),
	createdAt: persistedDateSchema,
});

export const pendingWorkspaceSchema = z.object({
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	name: z.string(),
	branchName: z.string(),
	prompt: z.string(),
	baseBranch: z.string().nullable().default(null),
	runSetupScript: z.boolean().default(true),
	linkedIssues: z.array(z.unknown()).default([]),
	linkedPR: z.unknown().nullable().default(null),
	hostTarget: z.unknown(),
	attachmentCount: z.number().int().default(0),
	status: z.enum(["creating", "failed", "succeeded"]).default("creating"),
	error: z.string().nullable().default(null),
	workspaceId: z.string().nullable().default(null),
	initialCommands: z.array(z.string()).nullable().default(null),
	createdAt: persistedDateSchema,
});

export type PendingWorkspaceRow = z.infer<typeof pendingWorkspaceSchema>;

export type DashboardSidebarProjectRow = z.infer<
	typeof dashboardSidebarProjectSchema
>;
export type WorkspaceLocalStateRow = z.infer<typeof workspaceLocalStateSchema>;
export type DashboardSidebarSectionRow = z.infer<
	typeof dashboardSidebarSectionSchema
>;
export type V2TerminalPresetRow = z.infer<typeof v2TerminalPresetSchema>;
