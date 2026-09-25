import fs from "node:fs";
import path from "node:path";
import { resolveSupersetHomeDir } from "./paths";
import { writeFileIfChanged } from "./write-file-if-changed";

export const AGENT_HOOKS_STATE_FILE = "agent-hooks.json";

/**
 * Machine-shared mirror of the user's per-agent hooks-disable choice. The
 * desktop's SQLite settings row stays the source of truth for its UI, but
 * multiple provisioners can run on one machine (the desktop plus one CLI
 * host-service per org) and each re-applies setup at boot — without a shared
 * view, a CLI host would resurrect hooks the user disabled in the desktop
 * until the desktop's next boot tore them down again.
 *
 * The desktop rewrites this file at boot and on every toggle; headless
 * provisioners read it (plus the SUPERSET_DISABLED_AGENT_HOOKS env override,
 * for hosts whose machine never runs the desktop).
 */
export function getAgentHooksStateFilePath(): string {
	return path.join(resolveSupersetHomeDir(), AGENT_HOOKS_STATE_FILE);
}

export function readSharedDisabledAgentIds(): string[] {
	try {
		const raw: unknown = JSON.parse(
			fs.readFileSync(getAgentHooksStateFilePath(), "utf-8"),
		);
		const ids = (raw as { disabledAgentIds?: unknown })?.disabledAgentIds;
		if (!Array.isArray(ids)) return [];
		return ids.filter((id): id is string => typeof id === "string");
	} catch {
		// Missing or corrupt state means "nothing disabled" — the file is a
		// mirror, never the source of truth.
		return [];
	}
}

export function writeSharedDisabledAgentIds(ids: readonly string[]): void {
	try {
		fs.mkdirSync(resolveSupersetHomeDir(), { recursive: true });
		writeFileIfChanged(
			getAgentHooksStateFilePath(),
			`${JSON.stringify({ disabledAgentIds: [...ids].sort() }, null, "\t")}\n`,
			0o644,
		);
	} catch (error) {
		console.warn(
			"[agent-setup] failed to write shared agent-hooks state:",
			error,
		);
	}
}

function envDisabledAgentIds(): string[] {
	return (process.env.SUPERSET_DISABLED_AGENT_HOOKS ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
}

/**
 * The effective disable set for a provisioning run. An explicit list (the
 * desktop's settings row — its caller mirrors it to the shared file first)
 * takes the file's place; the env override always applies on top.
 */
export function resolveDisabledAgentIds(
	explicit?: readonly string[],
): string[] {
	const base = explicit ?? readSharedDisabledAgentIds();
	return [...new Set([...base, ...envDisabledAgentIds()])];
}
