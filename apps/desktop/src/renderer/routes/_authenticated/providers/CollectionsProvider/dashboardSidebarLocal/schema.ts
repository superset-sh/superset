import type { PaneWorkspaceState } from "@superset/pane-layout";
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

const paneWorkspaceStateSchema = z.custom<PaneWorkspaceState<unknown>>();

export const workspaceLocalStateSchema = z.object({
	workspaceId: z.string().uuid(),
	createdAt: persistedDateSchema,
	sidebarState: z.object({
		projectId: z.string().uuid(),
		tabOrder: z.number().int().default(0),
		sectionId: z.string().uuid().nullable().default(null),
	}),
	paneLayout: paneWorkspaceStateSchema,
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

export type DashboardSidebarProjectRow = z.infer<
	typeof dashboardSidebarProjectSchema
>;
export type WorkspaceLocalStateRow = z.infer<typeof workspaceLocalStateSchema>;
export type DashboardSidebarSectionRow = z.infer<
	typeof dashboardSidebarSectionSchema
>;
