import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, queryProcedure, router } from "../../index";
import { resolveHostAgentConfig } from "../agents/agents";
import { resolveDefaultAccountEnv } from "../usage/default-account";
import {
	AGENT_MEMORY_FILES,
	type AgentMemoryFileDefinition,
	getAgentMemoryFile,
} from "./registry";

/** Matches the editor cap on filesystem.writeFile — these are prose files. */
const MAX_MEMORY_FILE_BYTES = 2 * 1024 * 1024;

/** No separators, no leading dot — an auto-memory note name, never a path. */
const AUTO_MEMORY_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

const targetSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("global") }),
	z.object({ kind: z.literal("project"), projectId: z.string().uuid() }),
	z.object({
		kind: z.literal("auto-memory"),
		projectId: z.string().uuid(),
		fileName: z.string().regex(AUTO_MEMORY_FILE_NAME),
	}),
	z.object({ kind: z.literal("workspace"), workspaceId: z.string().uuid() }),
	z.object({
		kind: z.literal("workspace-auto-memory"),
		workspaceId: z.string().uuid(),
		fileName: z.string().regex(AUTO_MEMORY_FILE_NAME),
	}),
]);

export type AgentMemoryTarget = z.infer<typeof targetSchema>;

interface FileStats {
	path: string;
	exists: boolean;
	sizeBytes: number | null;
	updatedAt: Date | null;
}

export interface AgentMemoryListEntry extends FileStats {
	presetId: string;
	fileName: string;
	/** Global + project + workspace + auto-memory files that exist for this agent. */
	fileCount: number;
}

export interface AgentMemoryFileEntry extends FileStats {
	target: AgentMemoryTarget;
	fileName: string;
	/** Null for the global entry and for project-less session workspaces. */
	projectId: string | null;
	projectName: string | null;
	/** Set for workspace-scoped entries (worktrees + session workspaces). */
	workspaceId: string | null;
	workspaceName: string | null;
}

export interface AgentMemoryContent extends FileStats {
	presetId: string;
	fileName: string;
	/** Null when the file doesn't exist yet — first save creates it. */
	content: string | null;
	/** Content hash for optimistic concurrency; null when absent. */
	revision: string | null;
}

function hashRevision(content: string): string {
	return createHash("sha256").update(content, "utf-8").digest("hex");
}

function statPath(path: string): FileStats {
	const stats = existsSync(path) ? statSync(path) : null;
	const file = stats?.isFile() ? stats : null;
	return {
		path,
		exists: file !== null,
		sizeBytes: file?.size ?? null,
		updatedAt: file?.mtime ?? null,
	};
}

function resolveMemoryEnv(
	ctx: HostServiceContext,
	agent: string,
	presetId: string,
): Record<string, string> {
	const config = resolveHostAgentConfig(ctx.db, agent);
	// Same precedence as the agent launch itself: the config's own env wins
	// over the host-default account, so we edit the files the CLI actually
	// loads (multi-account profiles route through CLAUDE_CONFIG_DIR et al.).
	return {
		...resolveDefaultAccountEnv(ctx.db, presetId),
		...(config?.env ?? {}),
	};
}

interface ProjectRow {
	id: string;
	name: string;
	repoPath: string;
}

interface WorkspaceRow {
	id: string;
	projectId: string | null;
	name: string;
	worktreePath: string;
}

function listProjects(ctx: HostServiceContext): ProjectRow[] {
	return ctx.db
		.select()
		.from(projects)
		.all()
		.map((row) => ({
			id: row.id,
			// Empty until the startup backfill names the row — fall back like it does.
			name: row.name || basename(row.repoPath),
			repoPath: row.repoPath,
		}))
		.sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
		);
}

/** Non-main workspaces (worktrees + session workspaces), name-sorted. */
function listNonMainWorkspaces(ctx: HostServiceContext): WorkspaceRow[] {
	return ctx.db
		.select()
		.from(workspaces)
		.all()
		.filter((row) => row.type !== "main")
		.map((row) => ({
			id: row.id,
			projectId: row.projectId,
			name: row.name || row.branch || basename(row.worktreePath),
			worktreePath: row.worktreePath,
		}))
		.sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
		);
}

function requireProject(
	ctx: HostServiceContext,
	projectId: string,
): ProjectRow {
	const row = listProjects(ctx).find((project) => project.id === projectId);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Project not set up on this host: ${projectId}`,
		});
	}
	return row;
}

function requireWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
): WorkspaceRow {
	const row = ctx.db
		.select()
		.from(workspaces)
		.all()
		.find((workspace) => workspace.id === workspaceId);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace not found on this host: ${workspaceId}`,
		});
	}
	return {
		id: row.id,
		projectId: row.projectId,
		name: row.name || row.branch || basename(row.worktreePath),
		worktreePath: row.worktreePath,
	};
}

function resolveDefinition(
	ctx: HostServiceContext,
	agent: string,
): { definition: AgentMemoryFileDefinition; env: Record<string, string> } {
	const config = resolveHostAgentConfig(ctx.db, agent);
	const presetId = config?.presetId ?? agent;
	const definition = getAgentMemoryFile(presetId);
	if (!definition) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No memory files known for agent "${agent}"`,
		});
	}
	return { definition, env: resolveMemoryEnv(ctx, agent, presetId) };
}

function globalPath(
	definition: AgentMemoryFileDefinition,
	env: Record<string, string>,
): string {
	return join(
		definition.resolveConfigDir(env, os.homedir()),
		definition.fileName,
	);
}

/** Auto-memory *.md files in a cwd's memory dir, MEMORY.md first. */
function listAutoMemoryFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const names = readdirSync(dir)
		.filter((name) => AUTO_MEMORY_FILE_NAME.test(name))
		.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
	const index = names.indexOf("MEMORY.md");
	if (index > 0) {
		names.splice(index, 1);
		names.unshift("MEMORY.md");
	}
	return names;
}

/**
 * A worktree's instruction file is only interesting when it diverges from the
 * main checkout's copy — the committed file exists in every worktree, and
 * listing hundreds of identical branch copies would bury the real memory.
 * `mainPath` is null for session workspaces, which have no main to diff.
 */
function workspaceInstructionDiverges(
	workspacePath: string,
	mainPath: string | null,
): boolean {
	const workspaceFile = statPath(workspacePath);
	if (!workspaceFile.exists) return false;
	if (mainPath === null) return true;
	const mainFile = statPath(mainPath);
	if (!mainFile.exists) return true;
	if (workspaceFile.sizeBytes !== mainFile.sizeBytes) return true;
	try {
		return (
			readFileSync(workspacePath, "utf-8") !== readFileSync(mainPath, "utf-8")
		);
	} catch {
		return false;
	}
}

/**
 * Resolves the requested agent + target to an absolute path. Targets are
 * agent-, project-, and workspace-keyed, never path-keyed: global files come
 * from the config dir, project/workspace files from the projects and
 * workspaces tables, auto-memory notes from the derived per-cwd memory dir —
 * this router is the only surface that maps them to files, which is what
 * keeps it from becoming an arbitrary home-dir read/write hole.
 */
function resolveTargetPath(
	ctx: HostServiceContext,
	agent: string,
	target: AgentMemoryTarget,
): { definition: AgentMemoryFileDefinition; path: string; fileName: string } {
	const { definition, env } = resolveDefinition(ctx, agent);
	if (target.kind === "global") {
		return {
			definition,
			path: globalPath(definition, env),
			fileName: definition.fileName,
		};
	}
	if (target.kind === "workspace" || target.kind === "workspace-auto-memory") {
		const workspace = requireWorkspace(ctx, target.workspaceId);
		if (target.kind === "workspace") {
			return {
				definition,
				path: join(workspace.worktreePath, definition.projectFileName),
				fileName: definition.projectFileName,
			};
		}
		return resolveAutoMemoryNote(
			definition,
			env,
			agent,
			workspace.worktreePath,
			target.fileName,
		);
	}
	const project = requireProject(ctx, target.projectId);
	if (target.kind === "project") {
		return {
			definition,
			path: join(project.repoPath, definition.projectFileName),
			fileName: definition.projectFileName,
		};
	}
	return resolveAutoMemoryNote(
		definition,
		env,
		agent,
		project.repoPath,
		target.fileName,
	);
}

function resolveAutoMemoryNote(
	definition: AgentMemoryFileDefinition,
	env: Record<string, string>,
	agent: string,
	cwdPath: string,
	fileName: string,
): { definition: AgentMemoryFileDefinition; path: string; fileName: string } {
	if (!definition.resolveAutoMemoryDir) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Agent "${agent}" has no auto-memory directory`,
		});
	}
	const dir = definition.resolveAutoMemoryDir(env, os.homedir(), cwdPath);
	const path = resolve(dir, fileName);
	// The zod regex already forbids separators; keep containment as defense.
	if (path !== join(dir, fileName) || !path.startsWith(dir + sep)) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid file name" });
	}
	return { definition, path, fileName };
}

interface WorkspaceScopeFiles {
	/** Worktree instruction file path when it diverges from main (or exists, for sessions). */
	instructionPath: string | null;
	autoMemory: { dir: string; names: string[] };
}

function collectWorkspaceFiles(
	definition: AgentMemoryFileDefinition,
	env: Record<string, string>,
	workspace: WorkspaceRow,
	mainInstructionPath: string | null,
): WorkspaceScopeFiles {
	const instructionPath = join(
		workspace.worktreePath,
		definition.projectFileName,
	);
	const dir = definition.resolveAutoMemoryDir
		? definition.resolveAutoMemoryDir(env, os.homedir(), workspace.worktreePath)
		: null;
	return {
		instructionPath: workspaceInstructionDiverges(
			instructionPath,
			mainInstructionPath,
		)
			? instructionPath
			: null,
		autoMemory: dir
			? { dir, names: listAutoMemoryFiles(dir) }
			: { dir: "", names: [] },
	};
}

export const agentMemoryRouter = router({
	/**
	 * Every agent with known memory files, with the global file's stats and a
	 * count of existing files across global + project + workspace +
	 * auto-memory scopes.
	 */
	list: queryProcedure.query(({ ctx }): AgentMemoryListEntry[] => {
		const hostProjects = listProjects(ctx);
		const hostWorkspaces = listNonMainWorkspaces(ctx);
		return AGENT_MEMORY_FILES.map((definition) => {
			const env = resolveMemoryEnv(
				ctx,
				definition.presetId,
				definition.presetId,
			);
			const global = statPath(globalPath(definition, env));
			let fileCount = global.exists ? 1 : 0;
			const mainPathByProject = new Map<string, string>();
			for (const project of hostProjects) {
				const mainPath = join(project.repoPath, definition.projectFileName);
				mainPathByProject.set(project.id, mainPath);
				if (statPath(mainPath).exists) fileCount += 1;
				if (definition.resolveAutoMemoryDir) {
					fileCount += listAutoMemoryFiles(
						definition.resolveAutoMemoryDir(
							env,
							os.homedir(),
							project.repoPath,
						),
					).length;
				}
			}
			for (const workspace of hostWorkspaces) {
				const files = collectWorkspaceFiles(
					definition,
					env,
					workspace,
					workspace.projectId
						? (mainPathByProject.get(workspace.projectId) ?? null)
						: null,
				);
				if (files.instructionPath !== null) fileCount += 1;
				fileCount += files.autoMemory.names.length;
			}
			return {
				...global,
				presetId: definition.presetId,
				fileName: definition.fileName,
				fileCount,
			};
		});
	}),

	/**
	 * The file tree for one agent: the global file (always, so it can be
	 * created), then per project — sorted by name — the main checkout's
	 * instruction file and auto-memory notes followed by each of its
	 * worktrees' divergent instruction files and notes, then project-less
	 * session workspaces. Files are listed only where they exist.
	 */
	listFiles: queryProcedure
		.input(z.object({ agent: z.string().min(1) }))
		.query(({ ctx, input }): AgentMemoryFileEntry[] => {
			const { definition, env } = resolveDefinition(ctx, input.agent);
			const hostWorkspaces = listNonMainWorkspaces(ctx);
			const entries: AgentMemoryFileEntry[] = [
				{
					...statPath(globalPath(definition, env)),
					target: { kind: "global" },
					fileName: definition.fileName,
					projectId: null,
					projectName: null,
					workspaceId: null,
					workspaceName: null,
				},
			];

			const pushWorkspaceEntries = (
				workspace: WorkspaceRow,
				project: ProjectRow | null,
			) => {
				const files = collectWorkspaceFiles(
					definition,
					env,
					workspace,
					project ? join(project.repoPath, definition.projectFileName) : null,
				);
				const scope = {
					projectId: project?.id ?? null,
					projectName: project?.name ?? null,
					workspaceId: workspace.id,
					workspaceName: workspace.name,
				};
				if (files.instructionPath !== null) {
					entries.push({
						...statPath(files.instructionPath),
						target: { kind: "workspace", workspaceId: workspace.id },
						fileName: definition.projectFileName,
						...scope,
					});
				}
				for (const fileName of files.autoMemory.names) {
					entries.push({
						...statPath(join(files.autoMemory.dir, fileName)),
						target: {
							kind: "workspace-auto-memory",
							workspaceId: workspace.id,
							fileName,
						},
						fileName,
						...scope,
					});
				}
			};

			for (const project of listProjects(ctx)) {
				const projectFile = statPath(
					join(project.repoPath, definition.projectFileName),
				);
				if (projectFile.exists) {
					entries.push({
						...projectFile,
						target: { kind: "project", projectId: project.id },
						fileName: definition.projectFileName,
						projectId: project.id,
						projectName: project.name,
						workspaceId: null,
						workspaceName: null,
					});
				}
				if (definition.resolveAutoMemoryDir) {
					const dir = definition.resolveAutoMemoryDir(
						env,
						os.homedir(),
						project.repoPath,
					);
					for (const fileName of listAutoMemoryFiles(dir)) {
						entries.push({
							...statPath(join(dir, fileName)),
							target: { kind: "auto-memory", projectId: project.id, fileName },
							fileName,
							projectId: project.id,
							projectName: project.name,
							workspaceId: null,
							workspaceName: null,
						});
					}
				}
				for (const workspace of hostWorkspaces) {
					if (workspace.projectId !== project.id) continue;
					// The main checkout is already covered by the project scope.
					if (workspace.worktreePath === project.repoPath) continue;
					pushWorkspaceEntries(workspace, project);
				}
			}
			for (const workspace of hostWorkspaces) {
				if (workspace.projectId !== null) continue;
				pushWorkspaceEntries(workspace, null);
			}
			return entries;
		}),

	get: queryProcedure
		.input(
			z.object({
				agent: z.string().min(1),
				target: targetSchema.default({ kind: "global" }),
			}),
		)
		.query(({ ctx, input }): AgentMemoryContent => {
			const { definition, path, fileName } = resolveTargetPath(
				ctx,
				input.agent,
				input.target,
			);
			const info = statPath(path);
			const base = { presetId: definition.presetId, fileName, ...info };
			if (!info.exists) {
				return { ...base, content: null, revision: null };
			}
			if (info.sizeBytes !== null && info.sizeBytes > MAX_MEMORY_FILE_BYTES) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Memory file is too large to edit here (${info.sizeBytes} bytes): ${path}`,
				});
			}
			const content = readFileSync(path, "utf-8");
			return { ...base, content, revision: hashRevision(content) };
		}),

	write: protectedProcedure
		.input(
			z.object({
				agent: z.string().min(1),
				target: targetSchema.default({ kind: "global" }),
				content: z.string().max(MAX_MEMORY_FILE_BYTES),
				/** Revision the edit was based on; null = file must still be absent. */
				expectedRevision: z.string().nullable(),
			}),
		)
		.mutation(({ ctx, input }): { revision: string } => {
			const { path } = resolveTargetPath(ctx, input.agent, input.target);
			const current = existsSync(path) ? readFileSync(path, "utf-8") : null;
			const currentRevision = current === null ? null : hashRevision(current);
			if (currentRevision !== input.expectedRevision) {
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"Memory file changed on disk since it was loaded — reload and reapply your edit",
				});
			}
			try {
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, input.content, "utf-8");
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to write ${path}: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
			return { revision: hashRevision(input.content) };
		}),
});
