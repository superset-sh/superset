import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { languageServiceManager } from "main/lib/language-services/manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorkspace } from "../workspaces/utils/db-helpers";
import { getWorkspacePath } from "../workspaces/utils/worktree";

const languageServiceDocumentSchema = z.object({
	workspaceId: z.string(),
	absolutePath: z.string(),
	languageId: z.string(),
	content: z.string(),
	version: z.number().int().nonnegative(),
});

const languageServicePositionSchema = z.object({
	workspaceId: z.string(),
	absolutePath: z.string(),
	languageId: z.string(),
	line: z.number().int().positive(),
	column: z.number().int().positive(),
	content: z.string().optional(),
	version: z.number().int().nonnegative().optional(),
});

function resolveWorkspacePath(workspaceId: string): string {
	const workspace = getWorkspace(workspaceId);
	if (!workspace) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace ${workspaceId} not found`,
		});
	}

	const workspacePath = getWorkspacePath(workspace);
	if (!workspacePath) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Workspace ${workspaceId} has no filesystem path`,
		});
	}

	return workspacePath;
}

async function syncLookupDocumentIfNeeded(
	input: z.infer<typeof languageServicePositionSchema>,
): Promise<string> {
	const workspacePath = resolveWorkspacePath(input.workspaceId);
	if (input.content === undefined || input.version === undefined) {
		return workspacePath;
	}

	await languageServiceManager.syncDocument({
		workspaceId: input.workspaceId,
		workspacePath,
		absolutePath: input.absolutePath,
		languageId: input.languageId,
		content: input.content,
		version: input.version,
	});
	return workspacePath;
}

export const createLanguageServicesRouter = () => {
	return router({
		openDocument: publicProcedure
			.input(languageServiceDocumentSchema)
			.mutation(async ({ input }) => {
				const workspacePath = resolveWorkspacePath(input.workspaceId);
				await languageServiceManager.openDocument({
					...input,
					workspacePath,
				});
				return { ok: true };
			}),

		changeDocument: publicProcedure
			.input(languageServiceDocumentSchema)
			.mutation(async ({ input }) => {
				const workspacePath = resolveWorkspacePath(input.workspaceId);
				await languageServiceManager.syncDocument({
					...input,
					workspacePath,
				});
				return { ok: true };
			}),

		getHover: publicProcedure
			.input(languageServicePositionSchema)
			.query(async ({ input }) => {
				const workspacePath = await syncLookupDocumentIfNeeded(input);
				return await languageServiceManager.getHover({
					workspaceId: input.workspaceId,
					workspacePath,
					absolutePath: input.absolutePath,
					languageId: input.languageId,
					line: input.line,
					column: input.column,
				});
			}),

		getDefinition: publicProcedure
			.input(languageServicePositionSchema)
			.query(async ({ input }) => {
				const workspacePath = await syncLookupDocumentIfNeeded(input);
				return await languageServiceManager.getDefinition({
					workspaceId: input.workspaceId,
					workspacePath,
					absolutePath: input.absolutePath,
					languageId: input.languageId,
					line: input.line,
					column: input.column,
				});
			}),

		closeDocument: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					absolutePath: z.string(),
					languageId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const workspacePath = resolveWorkspacePath(input.workspaceId);
				await languageServiceManager.closeDocument({
					...input,
					workspacePath,
				});
				return { ok: true };
			}),

		refreshWorkspace: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const workspacePath = resolveWorkspacePath(input.workspaceId);
				await languageServiceManager.refreshWorkspace({
					workspaceId: input.workspaceId,
					workspacePath,
				});
				return { ok: true };
			}),

		getWorkspaceDiagnostics: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
				}),
			)
			.query(({ input }) => {
				const workspacePath = resolveWorkspacePath(input.workspaceId);
				return languageServiceManager.getWorkspaceSnapshot({
					workspaceId: input.workspaceId,
					workspacePath,
				});
			}),

		getProviders: publicProcedure.query(() => {
			return languageServiceManager.getProviders();
		}),

		setProviderEnabled: publicProcedure
			.input(
				z.object({
					providerId: z.string(),
					enabled: z.boolean(),
				}),
			)
			.mutation(async ({ input }) => {
				const provider = await languageServiceManager.setProviderEnabled(
					input.providerId,
					input.enabled,
				);
				if (!provider) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Language service provider ${input.providerId} not found`,
					});
				}

				return provider;
			}),

		subscribeDiagnostics: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
				}),
			)
			.subscription(({ input }) => {
				return observable<{ version: number }>((emit) => {
					const unsubscribe = languageServiceManager.subscribeToWorkspace(
						input.workspaceId,
						(payload) => {
							emit.next(payload);
						},
					);

					return () => {
						unsubscribe();
					};
				});
			}),
	});
};
