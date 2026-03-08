import { workspaceSections, workspaces } from "@superset/local-db";
import { eq, inArray } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getMaxProjectChildTabOrder } from "../utils/db-helpers";
import { reorderItems } from "../utils/reorder";

const SECTION_COLORS = PROJECT_COLORS.filter(
	(c) => c.value !== PROJECT_COLOR_DEFAULT,
);

function randomSectionColor(): string {
	return SECTION_COLORS[Math.floor(Math.random() * SECTION_COLORS.length)]
		.value;
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
	});
};
