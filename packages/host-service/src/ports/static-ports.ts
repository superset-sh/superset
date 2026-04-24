import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseStaticPortsConfig } from "@superset/port-scanner";

const PROJECT_SUPERSET_DIR_NAME = ".superset";
const PORTS_FILE_NAME = "ports.json";

interface LabelCacheEntry {
	labels: Map<number, string> | null;
	portsFileSignature: string | null;
	worktreePath: string | null;
}

function getPortsPath(worktreePath: string): string {
	return join(worktreePath, PROJECT_SUPERSET_DIR_NAME, PORTS_FILE_NAME);
}

function getPortsFileSignature(worktreePath: string): string | null {
	try {
		const stat = statSync(getPortsPath(worktreePath));
		return `${stat.mtimeMs}:${stat.size}`;
	} catch {
		return null;
	}
}

/**
 * Read `<worktree>/.superset/ports.json` and return a `port → label` map.
 * Returns null if the file is missing or malformed — this endpoint is a
 * best-effort label hint, not a validator, so parse errors are silent.
 */
function loadLabels(worktreePath: string): Map<number, string> | null {
	const portsPath = getPortsPath(worktreePath);

	if (!existsSync(portsPath)) return null;

	let content: string;
	try {
		content = readFileSync(portsPath, "utf-8");
	} catch {
		return null;
	}

	const parsed = parseStaticPortsConfig(content);
	if (parsed.ports === null) return null;

	const labels = new Map<number, string>();
	for (const port of parsed.ports) {
		labels.set(port.port, port.label);
	}
	return labels;
}

/**
 * Memoize label lookups per workspaceId. Called on every `ports.getAll`
 * (5s poll from each connected desktop), so the SQLite + fs reads would
 * otherwise repeat needlessly. `null` cached = "no labels file" — we want
 * that negative to stick too.
 */
const labelCache = new Map<string, LabelCacheEntry>();

function setLabelCache(
	workspaceId: string,
	worktreePath: string | null,
	labels: Map<number, string> | null,
): Map<number, string> | null {
	labelCache.set(workspaceId, {
		labels,
		portsFileSignature: worktreePath
			? getPortsFileSignature(worktreePath)
			: null,
		worktreePath,
	});
	return labels;
}

export function getLabelsForWorkspace(
	resolveWorktreePath: (workspaceId: string) => string | null,
	workspaceId: string,
): Map<number, string> | null {
	const cached = labelCache.get(workspaceId);
	if (cached) {
		if (cached.worktreePath === null) return cached.labels;
		const currentSignature = getPortsFileSignature(cached.worktreePath);
		if (currentSignature === cached.portsFileSignature) return cached.labels;
		return setLabelCache(
			workspaceId,
			cached.worktreePath,
			loadLabels(cached.worktreePath),
		);
	}

	const worktreePath = resolveWorktreePath(workspaceId);
	return setLabelCache(
		workspaceId,
		worktreePath,
		worktreePath ? loadLabels(worktreePath) : null,
	);
}

export function invalidateLabelCache(workspaceId?: string): void {
	if (workspaceId === undefined) labelCache.clear();
	else labelCache.delete(workspaceId);
}
