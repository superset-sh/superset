import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	type CloudAgentLaunch,
	readCloudAgentLaunch,
} from "@superset/shared/cloud-agent-launch";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { projects, workspaces } from "../../db/schema";
import { runAgentInWorkspace } from "../../trpc/router/agents/agents";
import { seedDefaultsIfEmpty } from "../../trpc/router/settings/agent-configs";
import type { HostServiceContext } from "../../types";

/**
 * Makes a sandbox describe its own workspace, instead of being described from
 * outside.
 *
 * A cloud workspace's sandbox holds exactly one project and one workspace, and
 * both are known before it boots: they are what it was provisioned for. The
 * first version of this reached into the sandbox from the API afterwards —
 * write a seed script, run it against host.db with better-sqlite3, hope the
 * shapes still match. That put the schema in two places and made provisioning
 * a sequence of remote-exec steps that each needed a wait.
 *
 * Reading the same facts from the environment here is the same work with none
 * of the choreography: the API's whole job becomes "start a sandbox with these
 * env vars". Idempotent, so a restart is a no-op.
 */
export interface SandboxIdentity {
	workspaceId: string;
	workspaceName: string;
	projectName: string;
	branch: string;
	worktreePath: string;
	/** The agent the workspace was created with, or null for an idle one. */
	launch: CloudAgentLaunch | null;
	/** Written once the launch has happened, so a restart never repeats it. */
	launchMarkerPath: string;
}

export function readSandboxIdentity(
	env: NodeJS.ProcessEnv = process.env,
): SandboxIdentity | null {
	const workspaceId = env.SUPERSET_SANDBOX_WORKSPACE_ID;
	const worktreePath = env.SUPERSET_SANDBOX_WORKSPACE_PATH;
	if (!workspaceId || !worktreePath) return null;
	return {
		workspaceId,
		worktreePath,
		workspaceName: env.SUPERSET_SANDBOX_WORKSPACE_NAME || "workspace",
		projectName: env.SUPERSET_SANDBOX_PROJECT_NAME || "project",
		branch: env.SUPERSET_SANDBOX_BRANCH || "main",
		launch: readCloudAgentLaunch(env),
		launchMarkerPath: join(
			dirname(env.HOST_DB_PATH || "/data/host.db"),
			".sandbox-agent-launched",
		),
	};
}

/**
 * Claude Code stops on a "use this custom API key?" prompt the first time it
 * sees an `ANTHROPIC_API_KEY`, and a launch nobody is watching would sit on
 * it. The key reaches the sandbox from the environment's variables, so it is
 * approved here the way the prompt would record it: the last 20 characters
 * in `~/.claude.json`.
 */
function approveClaudeApiKey(): void {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) return;
	const path = join(process.env.CLAUDE_CONFIG_DIR || homedir(), ".claude.json");
	let config: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			if (!parsed || typeof parsed !== "object")
				throw new Error("not an object");
			config = parsed as Record<string, unknown>;
		} catch (error) {
			// Rewriting a file this process cannot read would destroy whatever
			// Claude keeps in it; leave the prompt to the person instead.
			console.warn(
				`[sandbox] ${path} is not readable JSON, key not approved`,
				error,
			);
			return;
		}
	}
	const responses =
		config.customApiKeyResponses &&
		typeof config.customApiKeyResponses === "object"
			? (config.customApiKeyResponses as {
					approved?: unknown;
					rejected?: unknown;
				})
			: {};
	const approved = Array.isArray(responses.approved) ? responses.approved : [];
	const rejected = Array.isArray(responses.rejected) ? responses.rejected : [];
	const suffix = key.slice(-20);
	if (approved.includes(suffix)) return;
	config.customApiKeyResponses = {
		...responses,
		approved: [...approved, suffix],
		rejected: rejected.filter((entry) => entry !== suffix),
	};
	writeFileSync(path, JSON.stringify(config, null, 2));
}

/**
 * Runs the agent the workspace was created with, once. The same code path a
 * local host takes for `agents.run`, so the terminal, session tracking and
 * pane seeding all behave the way they do on a laptop. Called after the
 * server is listening: launching needs the pty daemon and the event bus up.
 */
export async function launchSandboxAgentOnce(
	ctx: HostServiceContext,
	identity: SandboxIdentity,
): Promise<void> {
	if (!identity.launch) return;
	if (existsSync(identity.launchMarkerPath)) return;
	const { agent, prompt, model, effort, mode } = identity.launch;
	// Claimed before the launch, not after: a restart while the first launch
	// is still setting up its terminal would otherwise start a second one.
	// A failed launch gives the claim back so the next start retries.
	writeFileSync(
		identity.launchMarkerPath,
		`${agent} ${new Date().toISOString()}\n`,
	);
	try {
		// Nothing has listed this host's agents yet, so the built-in presets are
		// not in its table; the launch resolves the agent through that table.
		seedDefaultsIfEmpty(ctx.db);
		if (agent === "claude") approveClaudeApiKey();
		await runAgentInWorkspace(ctx, {
			workspaceId: identity.workspaceId,
			agent,
			prompt,
			model,
			effort,
			mode,
		});
		console.log(
			`[sandbox] launched ${agent} for workspace ${identity.workspaceId}`,
		);
	} catch (error) {
		await rm(identity.launchMarkerPath, { force: true });
		console.error(
			`[sandbox] could not launch ${agent} for workspace ${identity.workspaceId}`,
			error,
		);
	}
}

export function runSandboxSelfSeed(
	db: HostDb,
	identity: SandboxIdentity,
): void {
	const existing = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.id, identity.workspaceId))
		.get();
	if (existing) return;

	const now = Date.now();
	const projectId = crypto.randomUUID();
	db.insert(projects)
		.values({
			id: projectId,
			repoPath: identity.worktreePath,
			name: identity.projectName,
			createdAt: now,
			updatedAt: now,
		})
		.run();
	// type='main' because the checkout *is* the repo here — there is no base
	// repo it was branched from. It also keeps the boot-time main-workspace
	// sweep from adding a second, phantom workspace to satisfy its
	// one-main-per-project index.
	db.insert(workspaces)
		.values({
			id: identity.workspaceId,
			projectId,
			worktreePath: identity.worktreePath,
			branch: identity.branch,
			name: identity.workspaceName,
			type: "main",
			createdAt: now,
			updatedAt: now,
		})
		.run();
}
