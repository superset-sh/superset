import { readdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects } from "../../../db/schema";
import { resolveDefaultBranchName } from "../../../runtime/git/refs";
import { resolveScript } from "../../../runtime/setup/config";
import { detectSetupCommand } from "../../../runtime/workspace-setup/detect";
import {
	getSetupState,
	resumeSetupMonitor,
	runWorkspaceSetup,
} from "../../../runtime/workspace-setup/service";
import {
	validateSharedPath,
	validateSharedSource,
} from "../../../runtime/workspace-setup/shared-files";
import { protectedProcedure, router } from "../../index";
import {
	requireLocalProject,
	requireProjectRepoPath,
} from "../workspace-creation/shared/local-project";

const projectInput = z.object({ projectId: z.string().uuid() });
export const workspaceSetupRouter = router({
	getProject: protectedProcedure
		.input(projectInput)
		.query(async ({ ctx, input }) => {
			const project = requireLocalProject(ctx, input.projectId);
			const repoPath = requireProjectRepoPath(project);
			const git = await ctx.git(repoPath);
			const refs = (
				await git.raw([
					"for-each-ref",
					"--format=%(refname)",
					"refs/heads/",
					"refs/remotes/",
				])
			)
				.trim()
				.split("\n")
				.filter((ref) => ref && !ref.endsWith("/HEAD"));
			const defaultName = await resolveDefaultBranchName(git);
			const defaultBaseRef = refs.includes(`refs/remotes/origin/${defaultName}`)
				? `refs/remotes/origin/${defaultName}`
				: refs.includes(`refs/heads/${defaultName}`)
					? `refs/heads/${defaultName}`
					: null;
			const resolved = resolveScript("setup", {
				repoPath,
				projectId: project.id,
			});
			const candidatePaths = (await readdir(repoPath)).filter((name) =>
				/^\.env(?:\.|$)/.test(name),
			);
			const candidates = (
				await Promise.all(
					candidatePaths.map(async (path) => {
						try {
							await validateSharedSource(git, repoPath, path);
							return path;
						} catch {
							return null;
						}
					}),
				)
			).filter((path): path is string => path !== null);
			return {
				defaultBaseRef: project.defaultBaseRef ?? defaultBaseRef,
				refs,
				sharedFilePaths: project.sharedFilePaths ?? [],
				candidates,
				suggestion: resolved ? null : detectSetupCommand(repoPath),
				suggestionDismissed: project.setupSuggestionDismissed,
				setupCommand: resolved
					? resolved.kind === "commands"
						? resolved.commands.join(" && ")
						: resolved.scriptPath
					: null,
			};
		}),
	updateProject: protectedProcedure
		.input(
			projectInput.extend({
				defaultBaseRef: z.string().min(1).max(1024).nullable().optional(),
				sharedFilePaths: z
					.array(z.string().min(1).max(1024))
					.max(100)
					.optional(),
				suggestionDismissed: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const project = requireLocalProject(ctx, input.projectId);
			const repoPath = requireProjectRepoPath(project);
			const git = await ctx.git(repoPath);
			if (input.defaultBaseRef) {
				if (!/^refs\/(heads|remotes)\//.test(input.defaultBaseRef))
					throw new Error("Choose a local or remote branch");
				await git.raw(["check-ref-format", input.defaultBaseRef]);
				await git.raw([
					"rev-parse",
					"--verify",
					`${input.defaultBaseRef}^{commit}`,
				]);
			}
			if (input.sharedFilePaths)
				for (const path of input.sharedFilePaths) {
					validateSharedPath(path);
					// Keep a temporarily missing existing selection editable. Newly added
					// paths must pass validation on this host before they can be saved.
					if (!project.sharedFilePaths?.includes(path))
						await validateSharedSource(git, repoPath, path);
				}
			ctx.db
				.update(projects)
				.set({
					...(input.defaultBaseRef !== undefined && {
						defaultBaseRef: input.defaultBaseRef,
					}),
					...(input.sharedFilePaths !== undefined && {
						sharedFilePaths: [...new Set(input.sharedFilePaths)],
					}),
					...(input.suggestionDismissed !== undefined && {
						setupSuggestionDismissed: input.suggestionDismissed,
					}),
					updatedAt: Date.now(),
				})
				.where(eq(projects.id, input.projectId))
				.run();
			return { ok: true };
		}),
	status: protectedProcedure
		.input(z.object({ workspaceId: z.string().uuid() }))
		.query(({ ctx, input }) => {
			resumeSetupMonitor(ctx, input.workspaceId);
			const state = getSetupState(ctx, input.workspaceId);
			if (!state) return null;
			const { agents, commandAfterSetup, userId, ...publicState } = state;
			return { ...publicState, pendingAgents: agents.length };
		}),
	retry: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				skipFile: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await runWorkspaceSetup(
				ctx,
				input.workspaceId,
				undefined,
				input.skipFile,
			);
			return { ok: true };
		}),
});
