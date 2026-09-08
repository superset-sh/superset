import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import {
	projects,
	terminalSessions,
	workspaceSetupRuns,
	workspaces,
} from "../../db/schema";
import { createTerminalSessionInternal } from "../../terminal/terminal";
import { startCommandTerminal } from "../../trpc/router/workspace-creation/shared/command-terminal";
import {
	type AgentLaunchResult,
	dispatchSugarAgents,
} from "../../trpc/router/workspace-creation/shared/dispatch-agents";
import { resolveInitialCommand } from "../../trpc/router/workspace-creation/shared/setup-terminal";
import type { HostServiceContext } from "../../types";
import { shellSingleQuote } from "../setup/config";
import { linkSharedFile } from "./shared-files";
import type { WorkspaceSetupState } from "./types";

const active = new WeakMap<object, Set<string>>();
function activeRuns(ctx: HostServiceContext) {
	let runs = active.get(ctx.db);
	if (!runs) {
		runs = new Set();
		active.set(ctx.db, runs);
	}
	return runs;
}
export function getSetupState(ctx: HostServiceContext, workspaceId: string) {
	return (
		ctx.db
			.select()
			.from(workspaceSetupRuns)
			.where(eq(workspaceSetupRuns.workspaceId, workspaceId))
			.get()?.state ?? null
	);
}
function save(
	ctx: HostServiceContext,
	workspaceId: string,
	state: WorkspaceSetupState,
) {
	state.updatedAt = Date.now();
	ctx.db
		.insert(workspaceSetupRuns)
		.values({ workspaceId, state })
		.onConflictDoUpdate({
			target: workspaceSetupRuns.workspaceId,
			set: { state },
		})
		.run();
}
function runDirectory(ctx: HostServiceContext, workspaceId: string) {
	const client = ctx.db.$client as unknown as {
		name?: string;
		filename?: string;
	};
	const dbPath = client.name ?? client.filename;
	if (!dbPath || dbPath === ":memory:")
		throw new Error("Workspace setup requires a persistent host database");
	return join(dirname(dbPath), "workspace-setup", workspaceId);
}
function fail(
	ctx: HostServiceContext,
	workspaceId: string,
	state: WorkspaceSetupState,
	error: unknown,
) {
	state.status = "failed";
	state.error = error instanceof Error ? error.message : String(error);
	save(ctx, workspaceId, state);
}
async function launch(
	ctx: HostServiceContext,
	workspaceId: string,
	state: WorkspaceSetupState,
	results: AgentLaunchResult[] = [],
	terminals: Array<{ terminalId: string; label?: string }> = [],
) {
	state.status = "launching";
	state.step = "agents";
	save(ctx, workspaceId, state);
	// Persist each successful dispatch before trying the next one. A crash during
	// dispatch is surfaced for review instead of automatically duplicating agents.
	while (state.agents.length) {
		const entry = state.agents[0];
		if (!entry) break;
		const [result] = await dispatchSugarAgents(ctx, workspaceId, [entry]);
		if (!result?.ok)
			throw new Error(
				result && "error" in result ? result.error : "Agent could not start",
			);
		results.push(result);
		state.agents.shift();
		save(ctx, workspaceId, state);
	}
	if (state.commandAfterSetup) {
		const result = await startCommandTerminal({
			ctx,
			workspaceId,
			command: state.commandAfterSetup,
		});
		if (result.warning) throw new Error(result.warning);
		if (result.terminal)
			terminals.push({
				terminalId: result.terminal.id,
				label: result.terminal.label,
			});
		state.commandAfterSetup = undefined;
	}
	state.status = "ready";
	state.error = undefined;
	save(ctx, workspaceId, state);
	await rm(runDirectory(ctx, workspaceId), {
		recursive: true,
		force: true,
	}).catch((error) => {
		console.warn("[workspace-setup] could not remove completed runner", error);
	});
}
function monitor(ctx: HostServiceContext, workspaceId: string) {
	const tick = async () => {
		if (!activeRuns(ctx).has(workspaceId)) return;
		const state = getSetupState(ctx, workspaceId);
		const workspace = ctx.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		if (
			!state ||
			state.status !== "running" ||
			!workspace ||
			workspace.archivedAt
		) {
			activeRuns(ctx).delete(workspaceId);
			return;
		}
		try {
			const result = await readFile(
				join(runDirectory(ctx, workspaceId), `${state.attemptId}.result`),
				"utf8",
			).catch((error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return null;
				throw error;
			});
			if (result !== null) {
				if (result.trim() !== "0")
					throw new Error(
						`Setup exited with code ${result.trim()}. Open output, fix the issue, then retry.`,
					);
				await launch(ctx, workspaceId, state);
				activeRuns(ctx).delete(workspaceId);
				return;
			}
			const terminal = state.terminalId
				? ctx.db
						.select()
						.from(terminalSessions)
						.where(eq(terminalSessions.id, state.terminalId))
						.get()
				: null;
			if (!terminal || terminal.status !== "active")
				throw new Error(
					"The setup terminal closed before setup finished. Retry setup to continue.",
				);
		} catch (error) {
			fail(ctx, workspaceId, state, error);
			activeRuns(ctx).delete(workspaceId);
			return;
		}
		setTimeout(() => {
			void tick();
		}, 750).unref();
	};
	setTimeout(() => {
		void tick();
	}, 750).unref();
}
export function resumeSetupMonitor(
	ctx: HostServiceContext,
	workspaceId: string,
) {
	if (activeRuns(ctx).has(workspaceId)) return;
	const state = getSetupState(ctx, workspaceId);
	if (!state || state.status === "ready" || state.status === "failed") return;
	if (state.status === "running") {
		activeRuns(ctx).add(workspaceId);
		monitor({ ...ctx, userId: state.userId }, workspaceId);
	} else
		fail(
			ctx,
			workspaceId,
			state,
			state.status === "launching"
				? "Host restarted during agent launch. Check existing sessions before retrying."
				: "Host restarted during setup. Retry to continue in this workspace.",
		);
}
export async function runWorkspaceSetup(
	ctx: HostServiceContext,
	workspaceId: string,
	initial?: WorkspaceSetupState,
	skipFile?: string,
) {
	if (activeRuns(ctx).has(workspaceId))
		throw new Error("Workspace setup is already running");
	const state = initial ?? getSetupState(ctx, workspaceId);
	const results: AgentLaunchResult[] = [];
	const terminals: Array<{ terminalId: string; label?: string }> = [];
	if (!state) throw new Error("Workspace setup was not found");
	if (initial) state.userId = ctx.userId;
	else ctx = { ...ctx, userId: state.userId };
	if (!initial && state.status !== "failed")
		throw new Error("Only failed setup can be retried");
	if (skipFile) {
		if (state.step !== "files" || state.failedPath !== skipFile)
			throw new Error("Only the failed file can be skipped");
		state.skippedFiles.push(skipFile);
	}
	activeRuns(ctx).add(workspaceId);
	try {
		const workspace = ctx.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		const project = workspace?.projectId
			? ctx.db
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get()
			: null;
		if (!workspace?.worktreePath || workspace.archivedAt || !project?.repoPath)
			throw new Error("Workspace is unavailable");
		state.error = undefined;
		if (state.step === "agents") {
			await launch(ctx, workspaceId, state, results, terminals);
			activeRuns(ctx).delete(workspaceId);
			return { state, agents: results, terminals };
		}
		state.status = "linking";
		state.step = "files";
		save(ctx, workspaceId, state);
		const git = await ctx.git(project.repoPath);
		for (const path of state.files) {
			if (state.skippedFiles.includes(path)) continue;
			state.failedPath = path;
			await linkSharedFile(git, project.repoPath, workspace.worktreePath, path);
		}
		state.failedPath = undefined;
		state.step = "command";
		const resolved = state.runSetup
			? resolveInitialCommand({
					repoPath: project.repoPath,
					projectId: project.id,
					worktreePath: workspace.worktreePath,
				})
			: null;
		if (!resolved) {
			await launch(ctx, workspaceId, state, results, terminals);
			activeRuns(ctx).delete(workspaceId);
			return { state, agents: results, terminals };
		}
		await rm(runDirectory(ctx, workspaceId), { recursive: true, force: true });
		await mkdir(runDirectory(ctx, workspaceId), {
			recursive: true,
			mode: 0o700,
		});
		state.attemptId = crypto.randomUUID();
		state.command = resolved.initialCommand;
		state.terminalId = crypto.randomUUID();
		const scriptPath = join(
			runDirectory(ctx, workspaceId),
			`${state.attemptId}.sh`,
		);
		const resultPath = join(
			runDirectory(ctx, workspaceId),
			`${state.attemptId}.result`,
		);
		await writeFile(
			scriptPath,
			`#!/bin/bash\nbash -c ${shellSingleQuote(resolved.initialCommand)}\nsetup_exit=$?\nprintf '%s' "$setup_exit" > ${shellSingleQuote(`${resultPath}.tmp`)}\nmv ${shellSingleQuote(`${resultPath}.tmp`)} ${shellSingleQuote(resultPath)}\nexit "$setup_exit"\n`,
			{ mode: 0o600 },
		);
		state.status = "running";
		save(ctx, workspaceId, state);
		const terminal = await createTerminalSessionInternal({
			terminalId: state.terminalId,
			workspaceId,
			db: ctx.db,
			eventBus: ctx.eventBus,
			initialCommand: `bash ${shellSingleQuote(scriptPath)}`,
			...(resolved.cwd && { cwd: resolved.cwd }),
		});
		if ("error" in terminal)
			throw new Error(`Could not start setup: ${terminal.error}`);
		monitor(ctx, workspaceId);
	} catch (error) {
		fail(ctx, workspaceId, state, error);
		activeRuns(ctx).delete(workspaceId);
	}
	return { state, agents: results, terminals };
}

export function stopSetupMonitors(db: object) {
	active.get(db)?.clear();
}
export function resumeWorkspaceSetups(ctx: HostServiceContext) {
	for (const row of ctx.db.select().from(workspaceSetupRuns).all())
		resumeSetupMonitor(ctx, row.workspaceId);
}
