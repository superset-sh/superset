import { z } from "zod";

const persistedDateSchema = z
	.union([z.string(), z.date()])
	.transform((value) => (typeof value === "string" ? new Date(value) : value));

export const v2SidebarProjectSchema = z.object({
	projectId: z.string().uuid(),
	createdAt: persistedDateSchema,
	isCollapsed: z.boolean().default(false),
	tabOrder: z.number().int().default(0),
});

export const v2SidebarWorkspaceSchema = z.object({
	workspaceId: z.string().uuid(),
	projectId: z.string().uuid(),
	createdAt: persistedDateSchema,
	tabOrder: z.number().int().default(0),
	sectionId: z.string().uuid().nullable().default(null),
});

export const v2SidebarSectionSchema = z.object({
	sectionId: z.string().uuid(),
	projectId: z.string().uuid(),
	name: z.string().trim().min(1),
	createdAt: persistedDateSchema,
	tabOrder: z.number().int().default(0),
	isCollapsed: z.boolean().default(false),
});

export type V2SidebarProjectRow = z.infer<typeof v2SidebarProjectSchema>;
export type V2SidebarWorkspaceRow = z.infer<typeof v2SidebarWorkspaceSchema>;
export type V2SidebarSectionRow = z.infer<typeof v2SidebarSectionSchema>;
