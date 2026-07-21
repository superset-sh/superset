import { z } from "zod";

export const sidebarStateScopeSchema = z.object({
	organizationId: z.string().min(1),
	userId: z.string().min(1),
});

export type SidebarStateScope = z.infer<typeof sidebarStateScopeSchema>;

export const sidebarProjectSchema = z.object({
	id: z.string().min(1),
	tabOrder: z.number().finite(),
	isCollapsed: z.boolean(),
});

export const sidebarGroupSchema = z.object({
	id: z.string().min(1),
	projectId: z.string().min(1),
	name: z.string(),
	tabOrder: z.number().finite(),
	isCollapsed: z.boolean(),
	color: z.string().nullable(),
});

export const sidebarWorkspaceSchema = z.object({
	id: z.string().min(1),
	projectId: z.string().min(1),
	groupId: z.string().nullable(),
	tabOrder: z.number().finite(),
	isHidden: z.boolean(),
});

export const sidebarStateSnapshotSchema = z.object({
	projects: z.array(sidebarProjectSchema),
	groups: z.array(sidebarGroupSchema),
	workspaces: z.array(sidebarWorkspaceSchema),
});

export type SidebarStateSnapshot = z.infer<typeof sidebarStateSnapshotSchema>;

export const EMPTY_SIDEBAR_STATE: SidebarStateSnapshot = {
	projects: [],
	groups: [],
	workspaces: [],
};

export const sidebarCommandSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("list") }),
	z.object({
		action: z.literal("create-group"),
		groupId: z.string().min(1),
		projectId: z.string().min(1),
		name: z.string().trim().min(1),
		color: z.string().nullable().optional(),
	}),
	z.object({
		action: z.literal("rename-group"),
		groupId: z.string().min(1),
		name: z.string().trim().min(1),
	}),
	z.object({
		action: z.literal("delete-group"),
		groupId: z.string().min(1),
	}),
	z.object({
		action: z.literal("move-workspace"),
		workspaceId: z.string().min(1),
		projectId: z.string().min(1),
		groupId: z.string().nullable(),
	}),
	z.object({
		action: z.literal("set-group-collapsed"),
		groupId: z.string().min(1),
		collapsed: z.boolean(),
	}),
]);

export type SidebarCommand = z.infer<typeof sidebarCommandSchema>;

export const sidebarStateDocumentSchema = z.object({
	version: z.literal(1),
	revision: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
	rendererMigrated: z.boolean(),
	state: sidebarStateSnapshotSchema,
});

export type SidebarStateDocument = z.infer<typeof sidebarStateDocumentSchema>;

export interface SidebarStateReadResult {
	initialized: boolean;
	document: SidebarStateDocument;
}
