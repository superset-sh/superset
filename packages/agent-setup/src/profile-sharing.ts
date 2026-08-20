/**
 * Shared-config plumbing behind provider "accounts".
 *
 * A secondary account is just a config dir the provider CLI gets pointed at
 * (CLAUDE_CONFIG_DIR / CODEX_HOME), so switching to one handed the CLI a
 * blank install: no skills, no plugins, no MCP servers, none of the user's
 * settings. These primitives make a profile dir mirror the default account
 * for everything that isn't a login.
 *
 * Two mechanisms, picked by what the CLI does to the path:
 *
 * - Directories are symlinked at the default account's dir. The share stays
 *   live — a skill or plugin installed later shows up in every account with
 *   no sync step — and a directory can't be atomically replaced out from
 *   under the link.
 * - Files are copied, and JSON files key-merged, because the CLIs write them
 *   with write-tmp-then-rename: a symlink would be replaced by a regular
 *   file on the first write and the config would silently fork.
 *
 * Copies and merges record what they wrote in a per-profile ledger, so a
 * value the user changed inside the profile is never clobbered by the next
 * provision. Nothing here reads or writes credentials.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeFileIfChanged } from "./agent-wrappers-common";

/** Per-profile record of what we last wrote, kept inside the profile dir. */
export const PROFILE_LEDGER_NAME = ".superset-profile.json";

export type SurfaceOutcome =
	/** A symlink now points the profile at the default account's dir. */
	| "linked"
	/** Content copied from the default account. */
	| "synced"
	/** JSON keys copied from the default account. */
	| "merged"
	/** Already matched the default account. */
	| "unchanged"
	/** The profile has its own version — left untouched. */
	| "user-owned"
	/** Nothing to share: the default account has no such surface. */
	| "absent";

export interface ProfileLedger {
	version: 1;
	/** Default-account dir these values were shared from. */
	sharedFrom: string;
	/** Surface name -> sha256 of the content we last wrote. */
	files: Record<string, string>;
	/** Surface name -> key -> serialized value we last wrote. */
	keys: Record<string, Record<string, string>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		return isPlainObject(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function readProfileLedger(
	profileDir: string,
	sharedFrom: string,
): ProfileLedger {
	const empty: ProfileLedger = {
		version: 1,
		sharedFrom,
		files: {},
		keys: {},
	};
	const stored = readJsonObject(path.join(profileDir, PROFILE_LEDGER_NAME));
	if (!stored) return empty;
	return {
		version: 1,
		sharedFrom,
		files: isPlainObject(stored.files)
			? (stored.files as Record<string, string>)
			: {},
		keys: isPlainObject(stored.keys)
			? (stored.keys as Record<string, Record<string, string>>)
			: {},
	};
}

export function writeProfileLedger(
	profileDir: string,
	ledger: ProfileLedger,
): void {
	try {
		writeFileIfChanged(
			path.join(profileDir, PROFILE_LEDGER_NAME),
			JSON.stringify(ledger, null, 2),
			0o644,
		);
	} catch (error) {
		console.warn(
			`[agent-setup] Could not write the profile ledger in ${profileDir}:`,
			error,
		);
	}
}

function lstatOrNull(target: string): fs.Stats | null {
	try {
		return fs.lstatSync(target);
	} catch {
		return null;
	}
}

function realpathOrNull(target: string): string | null {
	try {
		return fs.realpathSync(target);
	} catch {
		return null;
	}
}

/**
 * Points `targetPath` at `sourceDir` with a symlink. Only ever claims a path
 * that is free: an existing real directory with anything in it, or a symlink
 * the user aimed somewhere else, is reported as user-owned and left alone.
 */
export function linkSharedDir(
	sourceDir: string,
	targetPath: string,
): SurfaceOutcome {
	const source = realpathOrNull(sourceDir);
	if (source === null) return "absent";

	const existing = lstatOrNull(targetPath);
	if (existing?.isSymbolicLink()) {
		const current = realpathOrNull(targetPath);
		if (current === source) return "unchanged";
		// A link the user aimed elsewhere is deliberate; a dangling one is
		// debris (a profile whose old share target was deleted) and ours to
		// replace.
		if (current !== null) return "user-owned";
		fs.unlinkSync(targetPath);
	} else if (existing) {
		if (!existing.isDirectory()) return "user-owned";
		if (fs.readdirSync(targetPath).length > 0) return "user-owned";
		fs.rmdirSync(targetPath);
	}

	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	// "junction" is the one dir link Windows grants without elevation.
	fs.symlinkSync(
		source,
		targetPath,
		process.platform === "win32" ? "junction" : "dir",
	);
	return "linked";
}

export interface SyncSharedFileArgs {
	sourcePath: string;
	targetPath: string;
	/** Ledger key, normally the file name. */
	surface: string;
	ledger: ProfileLedger;
}

/**
 * Copies a file from the default account into the profile. The profile's copy
 * is only overwritten while it still holds what we last put there — once the
 * user edits it inside the profile, that edit wins from then on.
 */
export function syncSharedFile({
	sourcePath,
	targetPath,
	surface,
	ledger,
}: SyncSharedFileArgs): SurfaceOutcome {
	let content: string;
	try {
		content = fs.readFileSync(sourcePath, "utf-8");
	} catch {
		return "absent";
	}
	const hash = sha256(content);

	if (fs.existsSync(targetPath)) {
		let current: string;
		try {
			current = fs.readFileSync(targetPath, "utf-8");
		} catch {
			return "user-owned";
		}
		const currentHash = sha256(current);
		if (currentHash === hash) {
			ledger.files[surface] = hash;
			return "unchanged";
		}
		if (ledger.files[surface] !== currentHash) return "user-owned";
	}

	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	writeFileIfChanged(targetPath, content, 0o644);
	ledger.files[surface] = hash;
	return "synced";
}

export interface MergeSharedJsonKeysArgs {
	sourcePath: string;
	targetPath: string;
	/** Ledger key, normally the file name. */
	surface: string;
	ledger: ProfileLedger;
	/** Shared subset of the default account's file. */
	pick(source: Record<string, unknown>): Record<string, unknown>;
	/**
	 * Values written regardless of the default account — facts about being a
	 * secondary profile rather than shared config, so they are not tracked in
	 * the ledger and are re-applied whenever they drift.
	 */
	force?: Record<string, unknown>;
	/**
	 * Skip entirely when the profile has no readable file yet. Set for state
	 * files the CLI owns end to end (`.claude.json`), where creating one
	 * ourselves would fabricate a login that has not happened.
	 */
	requireExistingTarget?: boolean;
}

/**
 * Copies selected top-level keys from the default account's JSON file into
 * the profile's. Per key, the same rule as syncSharedFile: we only overwrite
 * a value that is still the one we wrote. A key we wrote and the user then
 * deleted comes back — the surface is shared, and re-adding it is the whole
 * point of the share.
 */
export function mergeSharedJsonKeys({
	sourcePath,
	targetPath,
	surface,
	ledger,
	pick,
	force,
	requireExistingTarget,
}: MergeSharedJsonKeysArgs): SurfaceOutcome {
	const existing = readJsonObject(targetPath);
	if (requireExistingTarget && existing === null) return "absent";
	if (existing === null && fs.existsSync(targetPath)) {
		console.warn(
			`[agent-setup] Could not parse ${targetPath}; skipping the shared-config merge`,
		);
		return "user-owned";
	}

	const source = readJsonObject(sourcePath);
	const desired = source ? pick(source) : {};
	if (source === null && !force) return "absent";

	const target = existing ?? {};
	const written = ledger.keys[surface] ?? {};
	let changed = false;

	for (const [key, value] of Object.entries(desired)) {
		const serialized = JSON.stringify(value);
		const current = key in target ? JSON.stringify(target[key]) : undefined;
		if (current === serialized) {
			written[key] = serialized;
			continue;
		}
		// Present with a value we never wrote: the user set it in this profile.
		if (current !== undefined && written[key] !== current) continue;
		target[key] = value;
		written[key] = serialized;
		changed = true;
	}

	for (const [key, value] of Object.entries(force ?? {})) {
		if (JSON.stringify(target[key]) === JSON.stringify(value)) continue;
		target[key] = value;
		changed = true;
	}

	ledger.keys[surface] = written;
	if (!changed) return "unchanged";

	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	writeFileIfChanged(targetPath, JSON.stringify(target, null, 2), 0o644);
	return "merged";
}
