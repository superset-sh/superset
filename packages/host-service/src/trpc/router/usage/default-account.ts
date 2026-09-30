/**
 * Host-wide default agent account for newly launched agents, which a project
 * can override. "Switching"
 * an account never touches credential stores — it only records which profile
 * dir to inject (CLAUDE_CONFIG_DIR / CODEX_HOME) when an agent starts, so the
 * agent CLI itself keeps owning every login end to end.
 */

import { randomUUID } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../db/index.ts";
import { hostSettings, projects, workspaces } from "../../../db/schema.ts";

type SwitchableAccountAgent = "claude" | "codex";

const POINTER_NAMES: Record<SwitchableAccountAgent, string> = {
	claude: "default-claude-config-dir",
	codex: "default-codex-home",
};

/**
 * Mirror of agent-setup's resolveSupersetHomeDir, not imported: this module
 * sits on the terminal env-resolution path (loaded by node --test) and must
 * stay free of the agent-setup surface — see account-provisioning.ts.
 */
function supersetHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset");
}

/**
 * Mirror of agent-setup's resolveWriteTarget, not imported for the reason
 * above. Without it, renaming onto a pointer a user symlinked into a
 * dotfiles repo would replace the link with a regular file.
 */
function resolveWriteTarget(filePath: string): string {
	try {
		return realpathSync(filePath);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "ENOENT" && code !== "ELOOP") throw error;
		return filePath;
	}
}

/**
 * Mirror of agent-setup's resolveAmbientCodexHome. New terminals preserve the
 * user's real Codex home separately from the profile Superset injects, so a
 * nested host-service can recover it without importing agent-setup here.
 */
function ambientCodexHome(): string {
	const fromEnv = process.env.CODEX_HOME?.trim();
	const supersetInjected = process.env.SUPERSET_DEFAULT_CODEX_HOME?.trim();
	const preservedAmbient = process.env.SUPERSET_AMBIENT_CODEX_HOME?.trim();
	if (
		fromEnv &&
		(!supersetInjected ||
			canonicalAccountHome(fromEnv) !== canonicalAccountHome(supersetInjected))
	) {
		return resolve(fromEnv);
	}
	if (preservedAmbient) return resolve(preservedAmbient);
	return join(homedir(), ".codex");
}

function canonicalAccountHome(target: string): string {
	try {
		return realpathSync(target);
	} catch {
		return resolve(target);
	}
}

function defaultAccountPointerPath(agent: SwitchableAccountAgent): string {
	return join(supersetHomeDir(), "state", POINTER_NAMES[agent]);
}

function temporaryPointerPath(pointerPath: string): string {
	return `${pointerPath}.${process.pid}.${randomUUID()}.tmp`;
}

/**
 * Publishes a selection where the agent wrappers can re-read it on every
 * launch (buildDefaultAccountResolver in agent-setup), so switching accounts
 * reaches existing terminals the next time the agent starts — the PTY env
 * alone is frozen at spawn. Empty file = system default. The host-wide pointer
 * is authoritative; write failures propagate so the UI cannot report a switch
 * that agent launches would not observe.
 */
export function syncDefaultAccountPointer(
	agent: SwitchableAccountAgent,
	selection: string | null,
): void {
	writePointerFile(defaultAccountPointerPath(agent), selection ?? "");
}

function writePointerFile(path: string, value: string): void {
	let temporaryPath: string | null = null;
	try {
		mkdirSync(dirname(path), { recursive: true });
		const pointerPath = resolveWriteTarget(path);
		temporaryPath = temporaryPointerPath(pointerPath);
		writeFileSync(temporaryPath, value);
		renameSync(temporaryPath, pointerPath);
		temporaryPath = null;
	} finally {
		if (temporaryPath) {
			try {
				unlinkSync(temporaryPath);
			} catch {
				// Best-effort cleanup after a failed write or rename.
			}
		}
	}
}

/**
 * Mirrors the wrapper's `${SUPERSET_ORGANIZATION_ID:-_}`. Scoping by org lets
 * each host-service reap its own stale pins: several org services can share
 * one Superset home, and each sees only its own workspaces.
 */
const UNSCOPED_ORG_DIR = "_";

function workspacePinOrgDir(): string {
	return join(
		supersetHomeDir(),
		"state",
		"workspace-accounts",
		process.env.ORGANIZATION_ID || UNSCOPED_ORG_DIR,
	);
}

function workspacePinPointerPath(
	workspaceId: string,
	agent: SwitchableAccountAgent,
): string {
	return join(workspacePinOrgDir(), workspaceId, POINTER_NAMES[agent]);
}

/**
 * Publishes each workspace's project pin where the agent wrappers read it
 * before the host-wide pointer, so pinning, switching, or clearing a pin
 * reaches terminals that are already open. Keyed by workspace because that
 * is the id every terminal carries. No file = not pinned. An unscoped sync
 * also removes pins of workspaces this org no longer has.
 */
export function syncWorkspaceAccountPins(
	db: HostDb,
	scope: { projectId?: string; workspaceId?: string } = {},
): void {
	const rows = db
		.select({
			workspaceId: workspaces.id,
			claudeConfigDir: projects.claudeConfigDir,
			codexHome: projects.codexHome,
		})
		.from(workspaces)
		.innerJoin(projects, eq(projects.id, workspaces.projectId))
		.where(
			scope.workspaceId
				? eq(workspaces.id, scope.workspaceId)
				: scope.projectId
					? eq(workspaces.projectId, scope.projectId)
					: undefined,
		)
		.all();
	for (const row of rows) {
		for (const [agent, pin] of [
			["claude", row.claudeConfigDir],
			["codex", row.codexHome],
		] as const) {
			const path = workspacePinPointerPath(row.workspaceId, agent);
			if (pin !== null) {
				writePointerFile(path, pin);
				continue;
			}
			try {
				unlinkSync(path);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
	}
	if (!scope.workspaceId && !scope.projectId && process.env.ORGANIZATION_ID) {
		reapWorkspacePins(new Set(rows.map((row) => row.workspaceId)));
	}
}

function reapWorkspacePins(liveWorkspaceIds: Set<string>): void {
	let entries: string[];
	try {
		entries = readdirSync(workspacePinOrgDir());
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	for (const workspaceId of entries) {
		if (liveWorkspaceIds.has(workspaceId)) continue;
		rmSync(join(workspacePinOrgDir(), workspaceId), {
			recursive: true,
			force: true,
		});
	}
}

/**
 * Publishes a fully written legacy value only if no host-wide pointer exists.
 * Linking the temporary file is an atomic create-if-absent claim, so two org
 * services migrating concurrently cannot replace each other's selection.
 */
function migrateDefaultAccountPointer(
	agent: SwitchableAccountAgent,
	selection: string,
): void {
	const dir = join(supersetHomeDir(), "state");
	mkdirSync(dir, { recursive: true });
	const pointerPath = defaultAccountPointerPath(agent);
	const temporaryPath = temporaryPointerPath(pointerPath);
	try {
		writeFileSync(temporaryPath, selection);
		try {
			linkSync(temporaryPath, pointerPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	} finally {
		try {
			unlinkSync(temporaryPath);
		} catch {
			// Best-effort cleanup after a failed write or link.
		}
	}
}

function readDefaultAccountPointer(agent: SwitchableAccountAgent): {
	exists: boolean;
	selection: string | null;
} {
	try {
		const value = readFileSync(defaultAccountPointerPath(agent), "utf8");
		return { exists: true, selection: value || null };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return { exists: false, selection: null };
	}
}

/**
 * Migrates legacy org-scoped selections into the host-wide pointer files.
 * Existing pointers are authoritative and are never overwritten at boot:
 * more than one org-specific host-service can share the same Superset home.
 */
export function syncDefaultAccountPointers(db: HostDb): void {
	getDefaultAccountSelections(db);
}

export interface DefaultAccountSelections {
	/** CLAUDE_CONFIG_DIR to inject, or null for the system-default login. */
	claudeConfigDir: string | null;
	/** CODEX_HOME to inject, or null for the system-default login. */
	codexHome: string | null;
}

export function getDefaultAccountSelections(
	db: HostDb,
): DefaultAccountSelections {
	const row = db.select().from(hostSettings).get();
	const claudePointer = readDefaultAccountPointer("claude");
	const codexPointer = readDefaultAccountPointer("codex");
	const legacyClaudeConfigDir = row?.defaultClaudeConfigDir ?? null;
	const legacyCodexHome = row?.defaultCodexHome ?? null;

	// Before pointer files existed, these values lived only in each org DB.
	// Migrate a concrete legacy selection only when no host-wide pointer exists.
	// A missing/null row must not publish an empty pointer: doing so lets an
	// unrelated org reset the selected account merely by starting up.
	if (!claudePointer.exists && legacyClaudeConfigDir) {
		try {
			migrateDefaultAccountPointer("claude", legacyClaudeConfigDir);
		} catch {
			// Migration is best-effort; the legacy DB value remains usable.
		}
	}
	if (!codexPointer.exists && legacyCodexHome) {
		try {
			migrateDefaultAccountPointer("codex", legacyCodexHome);
		} catch {
			// Migration is best-effort; the legacy DB value remains usable.
		}
	}
	// Re-read after migration: if another org won the atomic claim, this call
	// must immediately use the winning host-wide value rather than its own
	// losing legacy DB value.
	const resolvedClaudePointer = claudePointer.exists
		? claudePointer
		: readDefaultAccountPointer("claude");
	const resolvedCodexPointer = codexPointer.exists
		? codexPointer
		: readDefaultAccountPointer("codex");

	return {
		claudeConfigDir: resolvedClaudePointer.exists
			? resolvedClaudePointer.selection
			: legacyClaudeConfigDir,
		codexHome: resolvedCodexPointer.exists
			? resolvedCodexPointer.selection
			: legacyCodexHome,
	};
}

export function setDefaultAccountSelection(
	db: HostDb,
	agent: SwitchableAccountAgent,
	selection: string | null,
): void {
	const values =
		agent === "claude"
			? { defaultClaudeConfigDir: selection }
			: { defaultCodexHome: selection };
	db.insert(hostSettings)
		.values({ id: 1, ...values })
		.onConflictDoUpdate({ target: hostSettings.id, set: values })
		.run();
	syncDefaultAccountPointer(agent, selection);
}

/**
 * Env for a new terminal so agent CLIs typed or launched in it run on the
 * workspace's accounts. Both agents' vars — a shell can run either CLI.
 * Baked at PTY spawn as the fast path; the agent wrappers re-resolve later
 * switches from the pointer files at launch.
 */
export function resolveAccountTerminalEnv(
	db: HostDb,
	workspaceId: string | null,
	options: { pinsPublished: boolean } = { pinsPublished: true },
): Record<string, string> {
	const env = {
		...resolveAccountEnv(db, "claude", workspaceId),
		...resolveAccountEnv(db, "codex", workspaceId),
	};
	if (options.pinsPublished) return env;
	// Without the SUPERSET_DEFAULT_* twins the wrappers treat the spawn value
	// as user-set and keep it, instead of re-resolving past a pin they can't see.
	return Object.fromEntries(
		Object.entries(env).filter(([key]) => !key.startsWith("SUPERSET_DEFAULT_")),
	);
}

/**
 * Env to overlay on an agent launch so it runs on the workspace project's
 * pinned account, else the host default. A selection whose profile dir has
 * vanished is skipped: falling back beats booting the agent signed out.
 */
export function resolveAccountEnv(
	db: HostDb,
	presetId: string,
	workspaceId: string | null,
): Record<string, string> {
	if (presetId !== "claude" && presetId !== "codex") return {};
	const pinned = getEffectiveProjectPin(db, presetId, workspaceId);
	if (pinned !== null) return accountEnv(presetId, pinned || null);
	const selections = getDefaultAccountSelections(db);
	return accountEnv(
		presetId,
		presetId === "claude" ? selections.claudeConfigDir : selections.codexHome,
	);
}

/**
 * The workspace project's pin for `agent`: "" for the system login, null when
 * unpinned or when the pinned dir has vanished (launches then fall back to
 * the host default).
 */
export function getEffectiveProjectPin(
	db: HostDb,
	agent: SwitchableAccountAgent,
	workspaceId: string | null,
): string | null {
	const pinned = getProjectAccountSelection(db, agent, workspaceId);
	return pinned !== null && (pinned === "" || existsSync(pinned))
		? pinned
		: null;
}

function getProjectAccountSelection(
	db: HostDb,
	agent: SwitchableAccountAgent,
	workspaceId: string | null,
): string | null {
	if (!workspaceId) return null;
	const row = db
		.select({
			claudeConfigDir: projects.claudeConfigDir,
			codexHome: projects.codexHome,
		})
		.from(workspaces)
		.innerJoin(projects, eq(projects.id, workspaces.projectId))
		.where(eq(workspaces.id, workspaceId))
		.get();
	return (agent === "claude" ? row?.claudeConfigDir : row?.codexHome) ?? null;
}

function accountEnv(
	agent: SwitchableAccountAgent,
	selection: string | null,
): Record<string, string> {
	if (agent === "claude") {
		if (!selection || !existsSync(selection)) return {};
		// The SUPERSET_DEFAULT_* twin marks the value as Superset-injected, so
		// the agent wrapper can re-resolve a later switch without ever
		// overriding a value the user exported by hand.
		return {
			CLAUDE_CONFIG_DIR: selection,
			SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: selection,
		};
	}
	const ambientCodex = ambientCodexHome();
	const codexHome =
		selection && existsSync(selection) ? selection : ambientCodex;
	return {
		SUPERSET_AMBIENT_CODEX_HOME: ambientCodex,
		CODEX_HOME: codexHome,
		SUPERSET_DEFAULT_CODEX_HOME: codexHome,
	};
}
