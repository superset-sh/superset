import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
	type AgentLibraryScope,
	DEFINITION_NAME_PATTERN,
	encodeScopeKey,
	isValidDefinitionName,
	NEW_DEFINITION_NAME_PATTERN,
	parseScopeKey,
	USER_SCOPE_KEY,
} from "@superset/shared/agent-library";
import { createFsHostService } from "@superset/workspace-fs/host";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import {
	createDefinition,
	DefinitionStoreError,
	getDefinition,
	listDefinitions,
	removeDefinition,
	saveDefinition,
	type ScopeRoot,
	transferDefinition,
} from "./definition-store";

/**
 * Definition-file library (Claude Code subagents + skills) by scope.
 * Definitions are addressed as { scopeKey, kind, name } — clients never send
 * filesystem paths. Every mutation runs through an FsService rooted at the
 * scope directory, so writes cannot escape `~/.claude` (user scope) or the
 * project repo (project scope).
 */

const USER_AGENT_DIRS = ["agents"];
const USER_SKILL_DIRS = ["skills"];
// Claude Code's own dirs first: on name collisions `.claude/` wins, matching
// what the CLI actually loads.
const PROJECT_AGENT_DIRS = [".claude/agents", ".agents/agents"];
const PROJECT_SKILL_DIRS = [".claude/skills", ".agents/skills"];

// The user scope root lives outside any workspace, so it gets its own
// confined service (module-level: one host process, one home dir).
let userScopeFs: ReturnType<typeof createFsHostService> | null = null;

function getUserRootPath(): string {
	return join(homedir(), ".claude");
}

function getUserScopeRoot(): ScopeRoot {
	const rootPath = getUserRootPath();
	if (!userScopeFs) {
		userScopeFs = createFsHostService({ rootPath });
	}
	return {
		scopeKey: USER_SCOPE_KEY,
		rootPath,
		fs: userScopeFs,
		agentDirs: USER_AGENT_DIRS,
		skillDirs: USER_SKILL_DIRS,
	};
}

function getProjectScopeRoot(
	ctx: HostServiceContext,
	projectId: string,
): ScopeRoot {
	try {
		return {
			scopeKey: encodeScopeKey({ kind: "project", projectId }),
			rootPath: ctx.runtime.filesystem.resolveProjectRoot(projectId),
			fs: ctx.runtime.filesystem.getServiceForProject(projectId),
			agentDirs: PROJECT_AGENT_DIRS,
			skillDirs: PROJECT_SKILL_DIRS,
		};
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith("Project not found:")
		) {
			throw new TRPCError({ code: "NOT_FOUND", message: error.message });
		}
		throw error;
	}
}

function resolveScopeRoot(ctx: HostServiceContext, scopeKey: string): ScopeRoot {
	const scope = parseScopeKey(scopeKey);
	if (!scope) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid scope key: ${scopeKey}`,
		});
	}
	return scope.kind === "user"
		? getUserScopeRoot()
		: getProjectScopeRoot(ctx, scope.projectId);
}

/**
 * `~/.claude` may not exist yet on a fresh host; the confined service can't
 * create its own root, so this is the one sanctioned mkdir outside it. Only
 * called before mutations that add files to the user scope.
 */
async function ensureScopeRootExists(root: ScopeRoot): Promise<void> {
	await mkdir(root.rootPath, { recursive: true });
}

function listAllScopes(ctx: HostServiceContext): AgentLibraryScope[] {
	const projects = ctx.db.query.projects.findMany().sync();
	return [
		{ kind: "user" },
		...projects.map(
			(project): AgentLibraryScope => ({
				kind: "project",
				projectId: project.id,
			}),
		),
	];
}

function toTrpcError(error: unknown): unknown {
	if (!(error instanceof DefinitionStoreError)) return error;
	switch (error.code) {
		case "NOT_FOUND":
			return new TRPCError({ code: "NOT_FOUND", message: error.message });
		case "ALREADY_EXISTS":
			return new TRPCError({ code: "CONFLICT", message: error.message });
		case "REVISION_CONFLICT":
			return new TRPCError({
				code: "PRECONDITION_FAILED",
				message: error.message,
			});
		case "TOO_LARGE":
			return new TRPCError({
				code: "PAYLOAD_TOO_LARGE",
				message: error.message,
			});
		case "INVALID":
			return new TRPCError({ code: "BAD_REQUEST", message: error.message });
	}
}

const definitionKindSchema = z.enum(["agent", "skill"]);

const definitionNameSchema = z
	.string()
	.regex(DEFINITION_NAME_PATTERN)
	.refine(isValidDefinitionName, "Invalid definition name");

const refSchema = z.object({
	scopeKey: z.string(),
	kind: definitionKindSchema,
	name: definitionNameSchema,
});

const patchSchema = z.object({
	model: z.string().min(1).nullable().optional(),
	effort: z.string().min(1).nullable().optional(),
	description: z.string().nullable().optional(),
});

function patchToRecord(
	patch: z.infer<typeof patchSchema> | undefined,
): Record<string, string | null> | undefined {
	if (!patch) return undefined;
	const record: Record<string, string | null> = {};
	for (const key of ["model", "effort", "description"] as const) {
		const value = patch[key];
		if (value !== undefined) record[key] = value;
	}
	return Object.keys(record).length > 0 ? record : undefined;
}

export const agentLibraryRouter = router({
	listScopes: protectedProcedure.query(({ ctx }) => {
		return listAllScopes(ctx).map((scope) => {
			if (scope.kind === "user") {
				return {
					scopeKey: USER_SCOPE_KEY,
					kind: "user" as const,
					label: "User",
					rootPath: getUserRootPath(),
				};
			}
			const project = ctx.db.query.projects
				.findFirst({
					where: (projects, { eq }) => eq(projects.id, scope.projectId),
				})
				.sync();
			return {
				scopeKey: encodeScopeKey(scope),
				kind: "project" as const,
				label: project?.repoName ?? basename(project?.repoPath ?? ""),
				rootPath: project?.repoPath ?? "",
			};
		});
	}),

	list: protectedProcedure
		.input(z.object({ scopeKeys: z.array(z.string()).optional() }).optional())
		.query(async ({ ctx, input }) => {
			const scopes =
				input?.scopeKeys?.map((key) => resolveScopeRoot(ctx, key)) ??
				listAllScopes(ctx).map((scope) =>
					resolveScopeRoot(ctx, encodeScopeKey(scope)),
				);
			const results = await Promise.all(
				scopes.map(async (root) => {
					try {
						return await listDefinitions(root);
					} catch (error) {
						throw toTrpcError(error);
					}
				}),
			);
			return results.flat();
		}),

	get: protectedProcedure.input(refSchema).query(async ({ ctx, input }) => {
		try {
			const root = resolveScopeRoot(ctx, input.scopeKey);
			return await getDefinition(root, input.kind, input.name);
		} catch (error) {
			throw toTrpcError(error);
		}
	}),

	save: protectedProcedure
		.input(
			refSchema.extend({
				patch: patchSchema.optional(),
				body: z.string().optional(),
				raw: z.string().optional(),
				expectedRevision: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const root = resolveScopeRoot(ctx, input.scopeKey);
				return await saveDefinition(root, {
					kind: input.kind,
					name: input.name,
					patch: patchToRecord(input.patch),
					body: input.body,
					raw: input.raw,
					expectedRevision: input.expectedRevision,
				});
			} catch (error) {
				throw toTrpcError(error);
			}
		}),

	create: protectedProcedure
		.input(
			z.object({
				scopeKey: z.string(),
				kind: definitionKindSchema,
				name: z.string().regex(NEW_DEFINITION_NAME_PATTERN),
				description: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const root = resolveScopeRoot(ctx, input.scopeKey);
				await ensureScopeRootExists(root);
				return await createDefinition(root, {
					kind: input.kind,
					name: input.name,
					description: input.description,
				});
			} catch (error) {
				throw toTrpcError(error);
			}
		}),

	remove: protectedProcedure
		.input(refSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const root = resolveScopeRoot(ctx, input.scopeKey);
				await removeDefinition(root, { kind: input.kind, name: input.name });
			} catch (error) {
				throw toTrpcError(error);
			}
		}),

	transfer: protectedProcedure
		.input(
			refSchema.extend({
				toScopeKey: z.string(),
				mode: z.enum(["copy", "move"]),
				overwrite: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const source = resolveScopeRoot(ctx, input.scopeKey);
				const target = resolveScopeRoot(ctx, input.toScopeKey);
				await ensureScopeRootExists(target);
				await transferDefinition({
					source,
					target,
					kind: input.kind,
					name: input.name,
					mode: input.mode,
					overwrite: input.overwrite ?? false,
				});
			} catch (error) {
				throw toTrpcError(error);
			}
		}),
});
