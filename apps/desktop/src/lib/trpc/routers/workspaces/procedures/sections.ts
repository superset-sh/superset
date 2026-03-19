import { workspaceSections, workspaces } from "@superset/local-db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getMaxProjectChildTabOrder } from "../utils/db-helpers";
import { placeWorkspacesAtProjectChildBoundary } from "../utils/project-children-order";
import { reorderItems } from "../utils/reorder";
import { computeVisualOrder } from "../utils/visual-order";

const SECTION_COLORS = PROJECT_COLORS.filter(
	(c) => c.value !== PROJECT_COLOR_DEFAULT,
);

function randomSectionColor(): string {
	return SECTION_COLORS[Math.floor(Math.random() * SECTION_COLORS.length)]
		.value;
}

type RootPlacement = "top" | "bottom";

function moveWorkspacesToRootBoundary(
	workspaceIds: string[],
	rootPlacement: RootPlacement,
) {
	const movingWorkspaces = localDb
		.select()
		.from(workspaces)
		.where(inArray(workspaces.id, workspaceIds))
		.all();

	if (movingWorkspaces.length === 0) return;

	const projectId = movingWorkspaces[0].projectId;
	if (movingWorkspaces.some((workspace) => workspace.projectId !== projectId)) {
		throw new Error(
			"Cannot move workspaces to the project root across different projects",
		);
	}

	const projectWorkspaces = localDb
		.select()
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), isNull(workspaces.deletingAt)),
		)
		.all();
	const projectSections = localDb
		.select()
		.from(workspaceSections)
		.where(eq(workspaceSections.projectId, projectId))
		.all();

	const targetWorkspaceIds = new Set(workspaceIds);
	const orderedWorkspaceIds = computeVisualOrder(
		[{ id: projectId, tabOrder: 0 }],
		projectWorkspaces,
		projectSections,
	).filter((id) => targetWorkspaceIds.has(id));
	const missingWorkspaceIds = workspaceIds.filter(
		(id) => !orderedWorkspaceIds.includes(id),
	);
	const normalizedItems = placeWorkspacesAtProjectChildBoundary(
		projectId,
		projectWorkspaces,
		projectSections,
		[...orderedWorkspaceIds, ...missingWorkspaceIds],
		rootPlacement,
	);
	const movingWorkspaceIdSet = new Set(workspaceIds);

	for (const item of normalizedItems) {
		if (item.kind === "workspace") {
			localDb
				.update(workspaces)
				.set({
					tabOrder: item.tabOrder,
					...(movingWorkspaceIdSet.has(item.id) ? { sectionId: null } : {}),
				})
				.where(eq(workspaces.id, item.id))
				.run();
			continue;
		}

		localDb
			.update(workspaceSections)
			.set({ tabOrder: item.tabOrder })
			.where(eq(workspaceSections.id, item.id))
			.run();
	}
}

export const createSectionsProcedures = () => {
	return router({
		createSection: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					name: z.string(),
				}),
			)
			.mutation(({ input }) => {
				const nextTabOrder = getMaxProjectChildTabOrder(input.projectId) + 1;

				const section = localDb
					.insert(workspaceSections)
					.values({
						projectId: input.projectId,
						name: input.name,
						tabOrder: nextTabOrder,
						color: randomSectionColor(),
					})
					.returning()
					.get();

				return section;
			}),

		setSectionColor: publicProcedure
			.input(
				z.object({
					id: z.string(),
					color: z.string().nullable(),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.update(workspaceSections)
					.set({ color: input.color })
					.where(eq(workspaceSections.id, input.id))
					.run();

				return { success: true };
			}),

		renameSection: publicProcedure
			.input(
				z.object({
					id: z.string(),
					name: z.string(),
				}),
			)
			.mutation(({ input }) => {
				localDb
					.update(workspaceSections)
					.set({ name: input.name })
					.where(eq(workspaceSections.id, input.id))
					.run();

				return { success: true };
			}),

		deleteSection: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				localDb
					.update(workspaces)
					.set({ sectionId: null })
					.where(eq(workspaces.sectionId, input.id))
					.run();
				localDb
					.delete(workspaceSections)
					.where(eq(workspaceSections.id, input.id))
					.run();

				return { success: true };
			}),

		reorderSections: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					fromIndex: z.number(),
					toIndex: z.number(),
				}),
			)
			.mutation(({ input }) => {
				const { projectId, fromIndex, toIndex } = input;

				const sections = localDb
					.select()
					.from(workspaceSections)
					.where(eq(workspaceSections.projectId, projectId))
					.all()
					.sort((a, b) => a.tabOrder - b.tabOrder);

				reorderItems(sections, fromIndex, toIndex);

				for (const section of sections) {
					localDb
						.update(workspaceSections)
						.set({ tabOrder: section.tabOrder })
						.where(eq(workspaceSections.id, section.id))
						.run();
				}

				return { success: true };
			}),

		toggleSectionCollapsed: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const section = localDb
					.select()
					.from(workspaceSections)
					.where(eq(workspaceSections.id, input.id))
					.get();

				if (!section) {
					throw new Error(`Section ${input.id} not found`);
				}

				localDb
					.update(workspaceSections)
					.set({ isCollapsed: !section.isCollapsed })
					.where(eq(workspaceSections.id, input.id))
					.run();

				return { success: true, isCollapsed: !section.isCollapsed };
			}),

		reorderWorkspacesInSection: publicProcedure
			.input(
				z.object({
					sectionId: z.string(),
					fromIndex: z.number(),
					toIndex: z.number(),
				}),
			)
			.mutation(({ input }) => {
				const { sectionId, fromIndex, toIndex } = input;

				const sectionWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.sectionId, sectionId))
					.all()
					.sort((a, b) => a.tabOrder - b.tabOrder);

				reorderItems(sectionWorkspaces, fromIndex, toIndex);

				for (const ws of sectionWorkspaces) {
					localDb
						.update(workspaces)
						.set({ tabOrder: ws.tabOrder })
						.where(eq(workspaces.id, ws.id))
						.run();
				}

				return { success: true };
			}),

		moveWorkspacesToSection: publicProcedure
			.input(
				z.object({
					workspaceIds: z.array(z.string()).min(1),
					sectionId: z.string().nullable(),
					rootPlacement: z.enum(["top", "bottom"]).optional(),
				}),
			)
			.mutation(({ input }) => {
				const matchingWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(inArray(workspaces.id, input.workspaceIds))
					.all();

				if (input.sectionId) {
					const section = localDb
						.select()
						.from(workspaceSections)
						.where(eq(workspaceSections.id, input.sectionId))
						.get();

					if (!section) {
						throw new Error(`Section ${input.sectionId} not found`);
					}

					const targetProjectId = section.projectId;
					for (const ws of matchingWorkspaces) {
						if (ws.projectId !== targetProjectId) {
							throw new Error(
								"Cannot move workspace to a section in a different project",
							);
						}
					}
				}

				if (input.sectionId === null && input.rootPlacement) {
					moveWorkspacesToRootBoundary(input.workspaceIds, input.rootPlacement);
					return { success: true };
				}

				localDb
					.update(workspaces)
					.set({ sectionId: input.sectionId })
					.where(inArray(workspaces.id, input.workspaceIds))
					.run();

				return { success: true };
			}),

		moveWorkspaceToSection: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					sectionId: z.string().nullable(),
					rootPlacement: z.enum(["top", "bottom"]).optional(),
				}),
			)
			.mutation(({ input }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.get();

				if (!workspace) {
					throw new Error(`Workspace ${input.workspaceId} not found`);
				}

				if (input.sectionId) {
					const section = localDb
						.select()
						.from(workspaceSections)
						.where(eq(workspaceSections.id, input.sectionId))
						.get();

					if (!section) {
						throw new Error(`Section ${input.sectionId} not found`);
					}

					if (section.projectId !== workspace.projectId) {
						throw new Error(
							"Cannot move workspace to a section in a different project",
						);
					}
				}

				if (input.sectionId === null && input.rootPlacement) {
					moveWorkspacesToRootBoundary(
						[input.workspaceId],
						input.rootPlacement,
					);
					return { success: true };
				}

				localDb
					.update(workspaces)
					.set({ sectionId: input.sectionId })
					.where(eq(workspaces.id, input.workspaceId))
					.run();

				return { success: true };
			}),
	});
};
