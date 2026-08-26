import fs from "node:fs";
import path from "node:path";
import { resolveSupersetHomeDir } from "./paths";
import { writeFileIfChanged } from "./write-file-if-changed";

export const DISABLED_SKILLS_STATE_FILE = "disabled-skills.json";

/**
 * Machine-shared mirror of the user's per-skill disable choice. The desktop's
 * SQLite settings row stays the source of truth for its UI, but multiple
 * provisioners can run on one machine (the desktop plus one CLI host-service
 * per org) and each re-applies setup at boot — without a shared view, a CLI
 * host would resurrect a skill the user disabled in the desktop until the
 * desktop's next boot tore it down again.
 *
 * The desktop rewrites this file at boot and on every toggle; headless
 * provisioners read it (plus the SUPERSET_DISABLED_SKILLS env override, for
 * hosts whose machine never runs the desktop).
 */
export function getDisabledSkillsStateFilePath(): string {
	return path.join(resolveSupersetHomeDir(), DISABLED_SKILLS_STATE_FILE);
}

export function readSharedDisabledSkillIds(): string[] {
	try {
		const raw: unknown = JSON.parse(
			fs.readFileSync(getDisabledSkillsStateFilePath(), "utf-8"),
		);
		const ids = (raw as { disabledSkillIds?: unknown })?.disabledSkillIds;
		if (!Array.isArray(ids)) return [];
		return ids.filter((id): id is string => typeof id === "string");
	} catch {
		// Missing or corrupt state means "nothing disabled" — the file is a
		// mirror, never the source of truth.
		return [];
	}
}

export function writeSharedDisabledSkillIds(ids: readonly string[]): void {
	try {
		fs.mkdirSync(resolveSupersetHomeDir(), { recursive: true });
		writeFileIfChanged(
			getDisabledSkillsStateFilePath(),
			`${JSON.stringify({ disabledSkillIds: [...ids].sort() }, null, "\t")}\n`,
			0o644,
		);
	} catch (error) {
		console.warn(
			"[agent-setup] failed to write shared disabled-skills state:",
			error,
		);
	}
}

function envDisabledSkillIds(): string[] {
	return (process.env.SUPERSET_DISABLED_SKILLS ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
}

/**
 * The effective disable set for a provisioning run. An explicit list (the
 * desktop's settings row — its caller mirrors it to the shared file first)
 * takes the file's place; the env override always applies on top.
 */
export function resolveDisabledSkillIds(
	explicit?: readonly string[],
): string[] {
	const base = explicit ?? readSharedDisabledSkillIds();
	return [...new Set([...base, ...envDisabledSkillIds()])];
}
