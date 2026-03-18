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
import { getProjectChildItems } from "../utils/project-children-order";
import { reorderItems } from "../utils/reorder";

const SECTION_COLORS = PROJECT_COLORS.filter(
	(c) => c.value !== PROJECT_COLOR_DEFAULT,
);

function randomSectionColor(): string {
	return SECTION_COLORS[Math.floor(Math.random() * SECTION_COLORS.length)]
		.value;
}

function normalizeSectionWorkspaceOrder(sectionId: string): void {
	const sectionWorkspaces = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.sectionId, sectionId))
		.all()
		.sort((a, b) => a.tabOrder - b.tabOrder);

	for (const [index, workspace] of sectionWorkspaces.entries()) {
		localDb
			.update(workspaces)
			.set({ tabOrder: index })
			.where(eq(workspaces.id, workspace.id))
			.run();
	}
}

function persistProjectChildOrder(
	items: ReturnType<typeof getProjectChildItems>,
): void {
	for (const item of items) {
		if (item.kind === "workspace") {
			localDb
				.update(workspaces)
				.set({ tabOrder: item.tabOrder })
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

function normalizeProjectChildOrder(projectId: string): void {
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
	const items = getProjectChildItems(
		projectId,
		projectWorkspaces,
		projectSections,
	);

	for (const [index, item] of items.entries()) {
		item.tabOrder = index;
	}

	persistProjectChildOrder(items);
}

function reorderProjectChildOrderWithWorkspace(
	projectId: string,
	workspaceId: string,
	targetIndex: number,
): void {
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
	const items = getProjectChildItems(
		projectId,
		projectWorkspaces,
		projectSections,
	);
	const currentIndex = items.findIndex(
		(item) => item.kind === "workspace" && item.id === workspaceId,
	);

	if (currentIndex === -1) {
		throw new Error(
			`Workspace ${workspaceId} not found in project ${projectId}`,
		);
	}

	const [moved] = items.splice(currentIndex, 1);
	const clampedTargetIndex = Math.max(0, Math.min(targetIndex, items.length));
	items.splice(clampedTargetIndex, 0, moved);

	for (const [index, item] of items.entries()) {
		item.tabOrder = index;
	}

	persistProjectChildOrder(items);
}

function reorderSectionWithWorkspace(
	sectionId: string,
	workspaceId: string,
	targetIndex: number,
): void {
	const sectionWorkspaces = localDb
		.select()
		.from(workspaces)
		.where(eq(workspaces.sectionId, sectionId))
		.all()
		.sort((a, b) => a.tabOrder - b.tabOrder);
	const currentIndex = sectionWorkspaces.findIndex(
		(workspace) => workspace.id === workspaceId,
	);

	if (currentIndex === -1) {
		throw new Error(
			`Workspace ${workspaceId} not found in section ${sectionId}`,
		);
	}

	const [moved] = sectionWorkspaces.splice(currentIndex, 1);
	const clampedTargetIndex = Math.max(
		0,
		Math.min(targetIndex, sectionWorkspaces.length),
	);
	sectionWorkspaces.splice(clampedTargetIndex, 0, moved);

	for (const [index, workspace] of sectionWorkspaces.entries()) {
		localDb
			.update(workspaces)
			.set({ tabOrder: index })
			.where(eq(workspaces.id, workspace.id))
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
				}),
			)
			.mutation(({ input }) => {
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
					const matchingWorkspaces = localDb
						.select()
						.from(workspaces)
						.where(inArray(workspaces.id, input.workspaceIds))
						.all();

					for (const ws of matchingWorkspaces) {
						if (ws.projectId !== targetProjectId) {
							throw new Error(
								"Cannot move workspace to a section in a different project",
							);
						}
					}
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

				localDb
					.update(workspaces)
					.set({ sectionId: input.sectionId })
					.where(eq(workspaces.id, input.workspaceId))
					.run();

				return { success: true };
			}),

		moveWorkspaceToSectionAtIndex: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					sectionId: z.string().nullable(),
					targetIndex: z.number().int().nonnegative(),
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

				const sourceSectionId = workspace.sectionId ?? null;

				if (sourceSectionId === input.sectionId) {
					if (input.sectionId === null) {
						reorderProjectChildOrderWithWorkspace(
							workspace.projectId,
							workspace.id,
							input.targetIndex,
						);
					} else {
						reorderSectionWithWorkspace(
							input.sectionId,
							workspace.id,
							input.targetIndex,
						);
					}

					return { success: true };
				}

				localDb
					.update(workspaces)
					.set({ sectionId: input.sectionId })
					.where(eq(workspaces.id, input.workspaceId))
					.run();

				if (sourceSectionId === null && input.sectionId !== null) {
					normalizeProjectChildOrder(workspace.projectId);
				}

				if (sourceSectionId !== null && sourceSectionId !== input.sectionId) {
					normalizeSectionWorkspaceOrder(sourceSectionId);
				}

				if (input.sectionId === null) {
					reorderProjectChildOrderWithWorkspace(
						workspace.projectId,
						workspace.id,
						input.targetIndex,
					);
				} else {
					reorderSectionWithWorkspace(
						input.sectionId,
						workspace.id,
						input.targetIndex,
					);
				}

				return { success: true };
			}),
	});
};
