import { projects, workspaces } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import {
	getWorkspaceNotDeleting,
	setLastActiveWorkspace,
	touchWorkspace,
} from "../utils/db-helpers";
import { getOriginRemoteUrl, parseGitRemoteUrl } from "../utils/git";

export const createStatusProcedures = () => {
	return router({
		reorder: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					fromIndex: z.number(),
					toIndex: z.number(),
				}),
			)
			.mutation(({ input }) => {
				const { projectId, fromIndex, toIndex } = input;

				const projectWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(
						and(
							eq(workspaces.projectId, projectId),
							isNull(workspaces.deletingAt),
						),
					)
					.all()
					.sort((a, b) => a.tabOrder - b.tabOrder);

				if (
					fromIndex < 0 ||
					fromIndex >= projectWorkspaces.length ||
					toIndex < 0 ||
					toIndex >= projectWorkspaces.length
				) {
					throw new Error("Invalid fromIndex or toIndex");
				}

				const [removed] = projectWorkspaces.splice(fromIndex, 1);
				projectWorkspaces.splice(toIndex, 0, removed);

				for (let i = 0; i < projectWorkspaces.length; i++) {
					localDb
						.update(workspaces)
						.set({ tabOrder: i })
						.where(eq(workspaces.id, projectWorkspaces[i].id))
						.run();
				}

				return { success: true };
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						name: z.string().optional(),
					}),
				}),
			)
			.mutation(({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.id);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.id} not found or is being deleted`,
					);
				}

				touchWorkspace(input.id, {
					...(input.patch.name !== undefined && { name: input.patch.name }),
				});

				return { success: true };
			}),

		setUnread: publicProcedure
			.input(z.object({ id: z.string(), isUnread: z.boolean() }))
			.mutation(({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.id);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.id} not found or is being deleted`,
					);
				}

				localDb
					.update(workspaces)
					.set({ isUnread: input.isUnread })
					.where(eq(workspaces.id, input.id))
					.run();

				return { success: true, isUnread: input.isUnread };
			}),

		linkToCloud: publicProcedure
			.input(z.object({ id: z.string(), cloudWorkspaceId: z.string().uuid() }))
			.mutation(({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.id);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.id} not found or is being deleted`,
					);
				}

				localDb
					.update(workspaces)
					.set({ cloudWorkspaceId: input.cloudWorkspaceId })
					.where(eq(workspaces.id, input.id))
					.run();

				return { success: true, cloudWorkspaceId: input.cloudWorkspaceId };
			}),

		unlinkFromCloud: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.id);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.id} not found or is being deleted`,
					);
				}

				localDb
					.update(workspaces)
					.set({ cloudWorkspaceId: null })
					.where(eq(workspaces.id, input.id))
					.run();

				return { success: true };
			}),

		getRepoInfo: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(async ({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.id);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.id} not found or is being deleted`,
					);
				}

				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get();

				if (!project) {
					throw new Error(`Project not found for workspace ${input.id}`);
				}

				const remoteUrl = await getOriginRemoteUrl(project.mainRepoPath);
				if (!remoteUrl) {
					return { hasRemote: false as const };
				}

				const parsed = parseGitRemoteUrl(remoteUrl);
				if (!parsed) {
					return { hasRemote: false as const };
				}

				return {
					hasRemote: true as const,
					repoOwner: parsed.owner,
					repoName: parsed.repo,
					repoUrl: parsed.repoUrl,
				};
			}),

		setActive: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.workspaceId);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.workspaceId} not found or is being deleted`,
					);
				}

				setLastActiveWorkspace(input.workspaceId);

				return { success: true, workspaceId: input.workspaceId };
			}),
	});
};
