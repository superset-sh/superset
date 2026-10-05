import { delimiter } from "node:path";
import { getBinDir } from "@superset/agent-setup";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";
import { buildHostLaunchEnv, waitForTerminalBaseEnv } from "../terminal/env";
import { resolveDefaultAccountTerminalEnv } from "../trpc/router/usage/default-account";

function workspacePaths(
	db: HostDb,
	workspaceId: string,
): { workspacePath: string; rootPath: string } {
	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	const project = workspace?.projectId
		? db.query.projects
				.findFirst({ where: eq(projects.id, workspace.projectId) })
				.sync()
		: undefined;
	return {
		workspacePath: workspace?.worktreePath ?? "",
		rootPath: project?.repoPath ?? "",
	};
}

function withSupersetBinFirst(
	env: Record<string, string>,
): Record<string, string> {
	const binDir = getBinDir();
	const key =
		Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
	const entries = (env[key] ?? "")
		.split(delimiter)
		.filter((entry) => entry && entry !== binDir);
	return { ...env, [key]: [binDir, ...entries].join(delimiter) };
}

function withoutAmbientKeys(
	env: Record<string, string>,
): Record<string, string> {
	const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...rest } = env;
	return rest;
}

/**
 * A chat agent is launched with the env a terminal would launch it with, so
 * the same CLI resolves the same tools and auth either way. `~/.superset/bin`
 * leads PATH because a terminal picks that up from the shell bootstrap, which
 * a directly spawned agent never runs, and it is what puts the superset CLI
 * and the agent wrappers in reach.
 */
export async function buildChatAgentEnv(options: {
	db: HostDb;
	cwd: string;
	workspaceId: string;
}): Promise<Record<string, string>> {
	await waitForTerminalBaseEnv();
	const paths = workspacePaths(options.db, options.workspaceId);
	return withoutAmbientKeys(
		withSupersetBinFirst({
			...buildHostLaunchEnv({
				cwd: options.cwd,
				workspaceId: options.workspaceId,
				workspacePath: paths.workspacePath || options.cwd,
				rootPath: paths.rootPath,
			}),
			...resolveDefaultAccountTerminalEnv(options.db),
		}),
	);
}
