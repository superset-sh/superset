/**
 * Host-wide default agent account for newly launched agents. "Switching"
 * an account never touches credential stores — it only records which profile
 * dir to inject (CLAUDE_CONFIG_DIR / CODEX_HOME) when an agent starts, so the
 * agent CLI itself keeps owning every login end to end.
 */

import { randomUUID } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { HostDb } from "../../../db/index.ts";
import { hostSettings } from "../../../db/schema.ts";

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
	let temporaryPath: string | null = null;
	try {
		const dir = join(supersetHomeDir(), "state");
		mkdirSync(dir, { recursive: true });
		const pointerPath = defaultAccountPointerPath(agent);
		temporaryPath = temporaryPointerPath(pointerPath);
		writeFileSync(temporaryPath, selection ?? "");
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
 * host-default accounts. Both agents' vars — a shell can run either CLI.
 * Baked at PTY spawn as the fast path; the agent wrappers re-resolve from the
 * pointer files at every launch, so a later switch still reaches this
 * terminal when the agent is relaunched.
 */
export function resolveDefaultAccountTerminalEnv(
	db: HostDb,
): Record<string, string> {
	return {
		...resolveDefaultAccountEnv(db, "claude"),
		...resolveDefaultAccountEnv(db, "codex"),
	};
}

/**
 * Env to overlay on an agent launch so it runs on the host-default account.
 * A pointer whose profile dir has vanished is skipped: falling back to the
 * system-default login beats booting the agent signed out.
 */
export function resolveDefaultAccountEnv(
	db: HostDb,
	presetId: string,
): Record<string, string> {
	if (presetId !== "claude" && presetId !== "codex") return {};
	const selections = getDefaultAccountSelections(db);
	if (
		presetId === "claude" &&
		selections.claudeConfigDir &&
		existsSync(selections.claudeConfigDir)
	) {
		// The SUPERSET_DEFAULT_* twin marks the value as Superset-injected, so
		// the agent wrapper can re-resolve a later switch without ever
		// overriding a value the user exported by hand.
		return {
			CLAUDE_CONFIG_DIR: selections.claudeConfigDir,
			SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: selections.claudeConfigDir,
		};
	}
	if (presetId === "codex") {
		const ambientCodex = ambientCodexHome();
		const ambient = { SUPERSET_AMBIENT_CODEX_HOME: ambientCodex };
		if (!selections.codexHome || !existsSync(selections.codexHome)) {
			return {
				...ambient,
				CODEX_HOME: ambientCodex,
				SUPERSET_DEFAULT_CODEX_HOME: ambientCodex,
			};
		}
		return {
			...ambient,
			CODEX_HOME: selections.codexHome,
			SUPERSET_DEFAULT_CODEX_HOME: selections.codexHome,
		};
	}
	return {};
}
