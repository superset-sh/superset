/**
 * Default agent account for newly launched agents: host-wide, with an
 * optional per-project override. "Switching" an account never touches
 * credential stores — it only records which profile dir to inject
 * (CLAUDE_CONFIG_DIR / CODEX_HOME) when an agent starts, so the agent CLI
 * itself keeps owning every login end to end.
 */

import { randomUUID } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../db/index.ts";
import { hostSettings, projects, workspaces } from "../../../db/schema.ts";

export type SwitchableAccountAgent = "claude" | "codex";

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

/**
 * Per-project pointers live one directory per project so the agent wrapper
 * can find them from `SUPERSET_PROJECT_ID` alone. A missing file means the
 * project inherits the host-wide pointer; an empty one pins the project to
 * the system-default login.
 */
function projectPointerDir(projectId: string): string {
	return join(supersetHomeDir(), "state", "projects", projectId);
}

function projectAccountPointerPath(
	projectId: string,
	agent: SwitchableAccountAgent,
): string {
	return join(projectPointerDir(projectId), POINTER_NAMES[agent]);
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
	writePointerAtomically(defaultAccountPointerPath(agent), selection ?? "");
}

function writePointerAtomically(targetPath: string, content: string): void {
	let temporaryPath: string | null = null;
	try {
		mkdirSync(join(targetPath, ".."), { recursive: true });
		const pointerPath = resolveWriteTarget(targetPath);
		temporaryPath = temporaryPointerPath(pointerPath);
		writeFileSync(temporaryPath, content);
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
 * A project's override for one provider. `null` = inherit the host-wide
 * default; `{ selection: null }` = the system-default login for this
 * project; `{ selection: dir }` = that profile.
 */
export type ProjectAccountOverride = { selection: string | null } | null;

/** Column encoding: null = inherit, "" = system default, dir = profile. */
function decodeProjectOverride(value: string | null): ProjectAccountOverride {
	return value === null ? null : { selection: value || null };
}

function encodeProjectOverride(
	override: ProjectAccountOverride,
): string | null {
	return override === null ? null : (override.selection ?? "");
}

/**
 * Mirrors a project override where the agent wrappers can re-read it on
 * every launch (the terminal exports SUPERSET_PROJECT_ID). Clearing the
 * override removes the file so the wrapper falls back to the host pointer.
 */
export function syncProjectDefaultAccountPointer(
	projectId: string,
	agent: SwitchableAccountAgent,
	override: ProjectAccountOverride,
): void {
	const pointerPath = projectAccountPointerPath(projectId, agent);
	if (override === null) {
		rmSync(pointerPath, { force: true });
		return;
	}
	writePointerAtomically(pointerPath, override.selection ?? "");
}

/** Drops every pointer a deleted project left behind. Best-effort. */
export function removeProjectDefaultAccountPointers(projectId: string): void {
	try {
		rmSync(projectPointerDir(projectId), { recursive: true, force: true });
	} catch (error) {
		console.warn(
			`[default-account] failed to remove pointers for project ${projectId}:`,
			error,
		);
	}
}

export interface ProjectDefaultAccountOverrides {
	claude: ProjectAccountOverride;
	codex: ProjectAccountOverride;
}

export function getProjectDefaultAccountOverrides(
	db: HostDb,
	projectId: string,
): ProjectDefaultAccountOverrides {
	const row = db
		.select({
			defaultClaudeConfigDir: projects.defaultClaudeConfigDir,
			defaultCodexHome: projects.defaultCodexHome,
		})
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
	return {
		claude: decodeProjectOverride(row?.defaultClaudeConfigDir ?? null),
		codex: decodeProjectOverride(row?.defaultCodexHome ?? null),
	};
}

export function setProjectDefaultAccountOverride(
	db: HostDb,
	projectId: string,
	agent: SwitchableAccountAgent,
	override: ProjectAccountOverride,
): boolean {
	const encoded = encodeProjectOverride(override);
	const updated = db
		.update(projects)
		.set(
			agent === "claude"
				? { defaultClaudeConfigDir: encoded }
				: { defaultCodexHome: encoded },
		)
		.where(eq(projects.id, projectId))
		.returning({ id: projects.id })
		.get();
	if (!updated) return false;
	syncProjectDefaultAccountPointer(projectId, agent, override);
	return true;
}

/** Every concrete profile some project is pinned to (system-default pins are omitted). */
export function listProjectAccountSelections(
	db: HostDb,
): Array<{ claudeConfigDir: string | null; codexHome: string | null }> {
	return db
		.select({
			claudeConfigDir: projects.defaultClaudeConfigDir,
			codexHome: projects.defaultCodexHome,
		})
		.from(projects)
		.all()
		.map((row) => ({
			claudeConfigDir: row.claudeConfigDir || null,
			codexHome: row.codexHome || null,
		}));
}

/**
 * Re-publishes every project override at boot. The DB row is the source of
 * truth; the pointer files are a cache the wrappers read, and a wiped state
 * dir must not silently drop a project back onto the host default.
 */
export function syncProjectDefaultAccountPointers(db: HostDb): void {
	const rows = db
		.select({
			id: projects.id,
			defaultClaudeConfigDir: projects.defaultClaudeConfigDir,
			defaultCodexHome: projects.defaultCodexHome,
		})
		.from(projects)
		.all();
	for (const row of rows) {
		for (const [agent, value] of [
			["claude", row.defaultClaudeConfigDir],
			["codex", row.defaultCodexHome],
		] as const) {
			const override = decodeProjectOverride(value);
			if (override === null) continue;
			try {
				syncProjectDefaultAccountPointer(row.id, agent, override);
			} catch (error) {
				console.warn(
					`[default-account] failed to publish ${agent} pointer for project ${row.id}:`,
					error,
				);
			}
		}
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
 * Where an agent is launching. The project's override wins over the
 * host-wide default; a workspace is resolved to its project here so call
 * sites that only hold a workspace id need no extra lookup. Sessions
 * (`projectId: null`) always use the host default.
 */
export interface DefaultAccountScope {
	projectId?: string | null;
	workspaceId?: string | null;
}

function resolveScopeProjectId(
	db: HostDb,
	scope: DefaultAccountScope | undefined,
): string | null {
	if (!scope) return null;
	if (scope.projectId !== undefined) return scope.projectId;
	if (!scope.workspaceId) return null;
	return (
		db
			.select({ projectId: workspaces.projectId })
			.from(workspaces)
			.where(eq(workspaces.id, scope.workspaceId))
			.get()?.projectId ?? null
	);
}

/** The profile dir to inject for `agent` in `scope`, or null for the system default. */
export function resolveAccountSelection(
	db: HostDb,
	agent: SwitchableAccountAgent,
	scope?: DefaultAccountScope,
): string | null {
	const projectId = resolveScopeProjectId(db, scope);
	if (projectId) {
		const override = getProjectDefaultAccountOverrides(db, projectId)[agent];
		if (override !== null) return override.selection;
	}
	const selections = getDefaultAccountSelections(db);
	return agent === "claude" ? selections.claudeConfigDir : selections.codexHome;
}

/**
 * Env for a new terminal so agent CLIs typed or launched in it run on the
 * default accounts for where it opens. Both agents' vars — a shell can run
 * either CLI. Baked at PTY spawn as the fast path; the agent wrappers
 * re-resolve from the pointer files at every launch, so a later switch
 * still reaches this terminal when the agent is relaunched.
 */
export function resolveDefaultAccountTerminalEnv(
	db: HostDb,
	scope?: DefaultAccountScope,
): Record<string, string> {
	return {
		...resolveDefaultAccountEnv(db, "claude", scope),
		...resolveDefaultAccountEnv(db, "codex", scope),
	};
}

/**
 * Env to overlay on an agent launch so it runs on the default account for
 * its project (or the host). A pointer whose profile dir has vanished is
 * skipped: falling back to the system-default login beats booting the
 * agent signed out.
 */
export function resolveDefaultAccountEnv(
	db: HostDb,
	presetId: string,
	scope?: DefaultAccountScope,
): Record<string, string> {
	if (presetId !== "claude" && presetId !== "codex") return {};
	const selection = resolveAccountSelection(db, presetId, scope);
	if (presetId === "claude" && selection && existsSync(selection)) {
		// The SUPERSET_DEFAULT_* twin marks the value as Superset-injected, so
		// the agent wrapper can re-resolve a later switch without ever
		// overriding a value the user exported by hand.
		return {
			CLAUDE_CONFIG_DIR: selection,
			SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: selection,
		};
	}
	if (presetId === "codex") {
		const ambientCodex = ambientCodexHome();
		const ambient = { SUPERSET_AMBIENT_CODEX_HOME: ambientCodex };
		if (!selection || !existsSync(selection)) {
			return {
				...ambient,
				CODEX_HOME: ambientCodex,
				SUPERSET_DEFAULT_CODEX_HOME: ambientCodex,
			};
		}
		return {
			...ambient,
			CODEX_HOME: selection,
			SUPERSET_DEFAULT_CODEX_HOME: selection,
		};
	}
	return {};
}
