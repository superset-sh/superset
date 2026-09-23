import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
	type CloudAgentLaunch,
	readCloudAgentLaunch,
} from "@superset/shared/cloud-agent-launch";
import {
	SANDBOX_PATHS,
	SANDBOX_ROOT_CHECKOUT,
	type SandboxRepository,
	sandboxCheckoutDir,
	sandboxRepositoriesSchema,
} from "@superset/shared/sandbox-contract";
import { eq, inArray } from "drizzle-orm";
import type { HostDb } from "../../db";
import { projects, workspaceRepos, workspaces } from "../../db/schema";
import { runAgentInWorkspace } from "../../trpc/router/agents/agents";
import { importCloudAttachments } from "../../trpc/router/attachments/attachments";
import { seedDefaultsIfEmpty } from "../../trpc/router/settings/agent-configs";
import type { HostServiceContext } from "../../types";
import {
	getManagedEnv,
	waitForManagedEnv,
} from "../sandbox-managed-env/sandbox-managed-env.ts";
import { resolveScript, shellSingleQuote } from "../setup/config";

/**
 * Makes a sandbox describe its own workspace, instead of being described from
 * outside.
 *
 * A cloud workspace's sandbox holds one workspace over the repositories it was
 * provisioned with, and all of it is known before it boots. The
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
	/** The directory the checkouts live under. */
	workspaceRoot: string;
	/** The primary repository's checkout: the one the workspace opens on. */
	worktreePath: string;
	/** Every checkout on the box, the primary first. */
	repositories: SandboxRepository[];
	/** The checkout whose `.superset/config.json` the box acts on. */
	hooksPath: string;
	/** The agent the workspace was created with, or null for an idle one. */
	launch: CloudAgentLaunch | null;
	/** Written once the launch has happened, so a restart never repeats it. */
	launchMarkerPath: string;
}

function readSandboxRepositories(raw: string | undefined): SandboxRepository[] {
	if (!raw) return [];
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		json = null;
	}
	const parsed = sandboxRepositoriesSchema.safeParse(json);
	if (!parsed.success) {
		console.warn(
			"[sandbox] SUPERSET_SANDBOX_REPOSITORIES is not a repository list",
		);
		return [];
	}
	return parsed.data;
}

export function readSandboxIdentity(
	env: NodeJS.ProcessEnv = process.env,
): SandboxIdentity | null {
	const workspaceId = env.SUPERSET_SANDBOX_WORKSPACE_ID;
	const root = env.SUPERSET_SANDBOX_WORKSPACE_PATH;
	if (!workspaceId || !root) return null;
	const repositories = readSandboxRepositories(
		env.SUPERSET_SANDBOX_REPOSITORIES,
	);
	const primary = repositories[0];
	if (!primary) return null;
	const hooksRepository = repositories.find((repo) => repo.hooks) ?? primary;
	return {
		workspaceId,
		workspaceRoot: root,
		worktreePath: sandboxCheckoutDir(root, primary.path),
		repositories,
		hooksPath: sandboxCheckoutDir(root, hooksRepository.path),
		// The API owns the workspace's name; the row here is scratch host-service
		// serves panes against, so it needs a name, not the name.
		workspaceName: "workspace",
		projectName: "project",
		branch: primary.branch,
		launch: readCloudAgentLaunch(env),
		launchMarkerPath: join(
			dirname(env.HOST_DB_PATH || SANDBOX_PATHS.hostDb),
			"agent-launched",
		),
	};
}

const START_HOOK_MARKER = join(SANDBOX_PATHS.run, "start-hook.pid");
const START_HOOK_LOG = join(SANDBOX_PATHS.logs, "start-hook.log");
/** Long enough for exec to fail, short enough that boot does not wait on it. */
const START_HOOK_SETTLE_MS = 3_000;

export type StartHookOutcome =
	| { started: true; pid: number; command: string }
	| {
			started: false;
			reason: "already-started" | "no-hook" | "failed";
			command?: string;
			exitCode?: number | null;
			log?: string;
	  };

/** What the hook is doing now, for `sandbox.status`. */
export type StartHookState =
	| { state: "none" }
	| { state: "running"; command: string; pid: number; since: number }
	| {
			state: "exited";
			command: string;
			exitCode: number | null;
			since: number;
			log: string;
	  };

let startHookState: StartHookState = { state: "none" };

export function getStartHookState(): StartHookState {
	return startHookState;
}

/** The tail of a hook's log, for a failure a person has to read. */
function readTail(path: string): string {
	try {
		return readFileSync(path, "utf8").slice(-4000);
	} catch {
		return "";
	}
}

/**
 * Runs the repository's `start` hook: the services a workspace needs on
 * every boot. The boot runner asks for it once host-service answers, the
 * managed environment has been pushed and the checkout is in; it runs here
 * because this process is the only one holding that environment, and the
 * variables never leave it. Once per boot: the marker lives in the run
 * directory the boot runner clears.
 */
export async function runSandboxStartHook(
	identity: SandboxIdentity,
): Promise<StartHookOutcome> {
	if (existsSync(START_HOOK_MARKER))
		return { started: false, reason: "already-started" };
	const resolved = resolveScript("start", {
		repoPath: identity.hooksPath,
		projectId: identity.workspaceId,
	});
	const commands = !resolved
		? null
		: resolved.kind === "commands"
			? resolved.commands
			: [`bash ${shellSingleQuote(resolved.scriptPath)}`];
	if (!commands?.length) return { started: false, reason: "no-hook" };
	// A repository lists steps; running them as one `&&` chain made a step that
	// failed take the rest with it. Each is its own process, and the services
	// still come up when something earlier had nothing to do.
	const configured = resolved?.cwd
		? resolve(identity.hooksPath, resolved.cwd)
		: identity.hooksPath;
	const log = openSync(START_HOOK_LOG, "a");
	const command = commands.join("; ");
	const child = spawn(
		"bash",
		["-lc", commands.map((one) => `{ ${one}; }`).join("\n")],
		{
			cwd: existsSync(configured) ? configured : identity.hooksPath,
			env: { ...process.env, ...getManagedEnv(), IS_SANDBOX: "1" },
			stdio: ["ignore", log, log],
			detached: true,
		},
	);
	child.unref();
	const pid = child.pid ?? 0;
	startHookState = { state: "running", command, pid, since: Date.now() };
	child.on("exit", (code) => {
		startHookState = {
			state: "exited",
			command,
			exitCode: code,
			since: Date.now(),
			log: readTail(START_HOOK_LOG),
		};
	});

	// A command that daemonizes (tmux new-session -d) also exits at once, so
	// only a non-zero exit inside this window counts as a failure to start.
	const failure = await new Promise<number | null>((resolve) => {
		const timer = setTimeout(() => resolve(null), START_HOOK_SETTLE_MS);
		child.once("exit", (code) => {
			clearTimeout(timer);
			resolve(code ?? null);
		});
	});
	if (failure !== null && failure !== 0) {
		console.error(`[sandbox] start hook failed (exit ${failure}): ${command}`);
		return {
			started: false,
			reason: "failed",
			command,
			exitCode: failure,
			log: readTail(START_HOOK_LOG),
		};
	}
	// Written only now: a hook that failed to start must be runnable again on
	// this boot, and the marker is what makes the next call a no-op.
	writeFileSync(START_HOOK_MARKER, `${pid}\n`);
	console.log(`[sandbox] start hook running (pid ${pid}): ${command}`);
	return { started: true, pid, command };
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
	const { agent, prompt, model, effort, mode, attachmentFileIds } =
		identity.launch;
	// The agent needs the environment the control plane pushes after boot and
	// the branch the boot runner is checking out beside us; both are seconds.
	const [pushed, checkedOut] = await Promise.all([
		waitForManagedEnv(120_000),
		waitForFlag(join(SANDBOX_PATHS.run, "checkout.ready"), 120_000),
	]);
	if (!pushed)
		console.warn("[sandbox] launching without a managed environment push");
	if (!checkedOut)
		console.warn("[sandbox] launching before the checkout reported ready");
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
		// Images the composer sent with the prompt: the bytes live in cloud
		// storage because this box did not exist when they were uploaded.
		// A download that fails must not cost the launch its prompt.
		let attachmentIds: string[] | undefined;
		if (attachmentFileIds?.length) {
			try {
				const imported = await importCloudAttachments(ctx, attachmentFileIds);
				attachmentIds = imported.map((item) => item.attachmentId);
			} catch (error) {
				console.error("[sandbox] could not import prompt attachments", error);
			}
		}
		await runAgentInWorkspace(ctx, {
			workspaceId: identity.workspaceId,
			agent,
			prompt,
			model,
			effort,
			mode,
			...(attachmentIds?.length ? { attachmentIds } : {}),
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

async function waitForFlag(path: string, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (existsSync(path)) return true;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	return false;
}

/**
 * The id a build that gave every repository past the first a workspace row of
 * its own derived for it. Boxes seeded that way are still in the wild, and
 * this is how the seed recognizes those rows to retire them.
 */
export function sandboxRepositoryWorkspaceId(
	workspaceId: string,
	path: string,
): string {
	const hash = createHash("sha256")
		.update(`${workspaceId}:${path}`)
		.digest("hex");
	return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

interface SandboxCheckout {
	position: number;
	folder: string;
	worktreePath: string;
	branch: string;
	baseBranch: string | null;
	/** The row a build before this one gave this repository; null for the primary. */
	retiredWorkspaceId: string | null;
}

function sandboxCheckouts(identity: SandboxIdentity): SandboxCheckout[] {
	return identity.repositories.map((repo, position) => ({
		position,
		folder:
			repo.path === SANDBOX_ROOT_CHECKOUT
				? basename(identity.workspaceRoot)
				: repo.path,
		worktreePath: sandboxCheckoutDir(identity.workspaceRoot, repo.path),
		branch: repo.branch,
		baseBranch: repo.baseBranch ?? null,
		retiredWorkspaceId:
			position === 0
				? null
				: sandboxRepositoryWorkspaceId(identity.workspaceId, repo.path),
	}));
}

interface DesiredWorkspaceRepo {
	position: number;
	projectId: string;
	folder: string;
	worktreePath: string;
	branch: string;
	baseBranch: string | null;
}

function workspaceReposMatch(
	stored: Array<typeof workspaceRepos.$inferSelect>,
	desired: DesiredWorkspaceRepo[],
): boolean {
	if (stored.length !== desired.length) return false;
	const byPosition = new Map(stored.map((row) => [row.position, row]));
	return desired.every((want) => {
		const row = byPosition.get(want.position);
		return (
			row?.projectId === want.projectId &&
			row.folder === want.folder &&
			row.worktreePath === want.worktreePath &&
			row.branch === want.branch &&
			row.baseBranch === want.baseBranch
		);
	});
}

/**
 * Seeds the box the way a local multi-repo workspace is stored: one workspace
 * row over one `workspace_repos` row per checkout, so `workspace.get`, the
 * `repo` argument on `git.*`, the watcher and the picker all read a cloud box
 * through the same path they read a laptop.
 *
 * A single-repository box keeps exactly the rows it always had — one workspace
 * with a null `root_path` and no repo rows, which `listWorkspaceRepos`
 * synthesizes the primary from.
 */
export function runSandboxSelfSeed(
	db: HostDb,
	identity: SandboxIdentity,
): void {
	const checkouts = sandboxCheckouts(identity);
	const primary = checkouts[0];
	if (!primary) return;
	const now = Date.now();
	const rootPath = checkouts.length > 1 ? identity.workspaceRoot : null;

	db.transaction((tx) => {
		const projectIdByRepoPath = new Map(
			tx
				.select({ id: projects.id, repoPath: projects.repoPath })
				.from(projects)
				.all()
				.map((row) => [row.repoPath, row.id] as const),
		);
		const projectIdFor = (checkout: SandboxCheckout): string => {
			const existing = projectIdByRepoPath.get(checkout.worktreePath);
			if (existing) return existing;
			const id = crypto.randomUUID();
			tx.insert(projects)
				.values({
					id,
					repoPath: checkout.worktreePath,
					name:
						checkout.position === 0 ? identity.projectName : checkout.folder,
					createdAt: now,
					updatedAt: now,
				})
				.run();
			projectIdByRepoPath.set(checkout.worktreePath, id);
			return id;
		};

		const existing = tx
			.select({
				projectId: workspaces.projectId,
				worktreePath: workspaces.worktreePath,
				rootPath: workspaces.rootPath,
			})
			.from(workspaces)
			.where(eq(workspaces.id, identity.workspaceId))
			.get();
		if (!existing) {
			// type='local' because the checkout *is* the repo here — there is no
			// base repo it was branched from.
			tx.insert(workspaces)
				.values({
					id: identity.workspaceId,
					projectId: projectIdFor(primary),
					worktreePath: primary.worktreePath,
					rootPath,
					branch: primary.branch,
					name: identity.workspaceName,
					type: "local",
					createdAt: now,
					updatedAt: now,
				})
				.run();
		} else {
			// `workspace_repos` position 0 is the workspace's own checkout, and
			// half the app reads the column rather than the row. A box seeded
			// before the container existed has no `root_path`; one whose
			// environment renamed its hooks repository has a new primary.
			const primaryProjectId = projectIdFor(primary);
			if (
				existing.rootPath !== rootPath ||
				existing.worktreePath !== primary.worktreePath ||
				existing.projectId !== primaryProjectId
			) {
				tx.update(workspaces)
					.set({
						rootPath,
						worktreePath: primary.worktreePath,
						projectId: primaryProjectId,
						updatedAt: now,
					})
					.where(eq(workspaces.id, identity.workspaceId))
					.run();
			}
		}

		if (checkouts.length > 1) {
			const desired = checkouts.map((checkout) => ({
				position: checkout.position,
				projectId: projectIdFor(checkout),
				folder: checkout.folder,
				worktreePath: checkout.worktreePath,
				branch: checkout.branch,
				baseBranch: checkout.baseBranch,
			}));
			const stored = tx
				.select()
				.from(workspaceRepos)
				.where(eq(workspaceRepos.workspaceId, identity.workspaceId))
				.all();
			// Replaced whole rather than merged: the environment's list is the
			// truth, and a repository that moved position would otherwise trip
			// the unique index row by row. Only when it actually differs, so a
			// restart leaves every id alone.
			if (!workspaceReposMatch(stored, desired)) {
				tx.delete(workspaceRepos)
					.where(eq(workspaceRepos.workspaceId, identity.workspaceId))
					.run();
				tx.insert(workspaceRepos)
					.values(
						desired.map((repo) => ({
							id: crypto.randomUUID(),
							workspaceId: identity.workspaceId,
							createdAt: now,
							...repo,
						})),
					)
					.run();
			}
		}

		const retired = checkouts.flatMap(
			(checkout) => checkout.retiredWorkspaceId ?? [],
		);
		if (retired.length > 0) {
			tx.delete(workspaces).where(inArray(workspaces.id, retired)).run();
		}
	});
}
