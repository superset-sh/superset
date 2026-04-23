import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_SUPERSET_DIR_NAME = ".superset";
const PORTS_FILE_NAME = "ports.json";

/**
 * Read `<worktree>/.superset/ports.json` and return a `port → label` map.
 * Returns null if the file is missing or malformed — this endpoint is a
 * best-effort label hint, not a validator, so parse errors are silent.
 */
function loadLabels(worktreePath: string): Map<number, string> | null {
	const portsPath = join(
		worktreePath,
		PROJECT_SUPERSET_DIR_NAME,
		PORTS_FILE_NAME,
	);

	if (!existsSync(portsPath)) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(portsPath, "utf-8"));
	} catch {
		return null;
	}

	if (typeof parsed !== "object" || parsed === null || !("ports" in parsed)) {
		return null;
	}
	const portsField = (parsed as { ports: unknown }).ports;
	if (!Array.isArray(portsField)) return null;

	const labels = new Map<number, string>();
	for (const entry of portsField) {
		if (typeof entry !== "object" || entry === null) continue;
		const { port, label } = entry as { port?: unknown; label?: unknown };
		if (
			typeof port === "number" &&
			Number.isInteger(port) &&
			port >= 1 &&
			port <= 65535 &&
			typeof label === "string" &&
			label.trim() !== ""
		) {
			labels.set(port, label.trim());
		}
	}
	return labels;
}

/**
 * Memoize label lookups per workspaceId. Called on every `ports.getAll`
 * (5s poll from each connected desktop), so the SQLite + fs reads would
 * otherwise repeat needlessly. `null` cached = "no labels file" — we want
 * that negative to stick too.
 */
const labelCache = new Map<string, Map<number, string> | null>();

export function getLabelsForWorkspace(
	resolveWorktreePath: (workspaceId: string) => string | null,
	workspaceId: string,
): Map<number, string> | null {
	if (labelCache.has(workspaceId)) return labelCache.get(workspaceId) ?? null;
	const worktreePath = resolveWorktreePath(workspaceId);
	const labels = worktreePath ? loadLabels(worktreePath) : null;
	labelCache.set(workspaceId, labels);
	return labels;
}

export function invalidateLabelCache(workspaceId?: string): void {
	if (workspaceId === undefined) labelCache.clear();
	else labelCache.delete(workspaceId);
}
