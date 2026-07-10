import { readFileSync, statSync } from "node:fs";
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

function isMissingPathError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | undefined)?.code;
	return code === "ENOENT" || code === "ENOTDIR";
}

function getPortsFileSignature(worktreePath: string): string | null {
	try {
		const stat = statSync(getPortsPath(worktreePath));
		return `${stat.mtimeMs}:${stat.size}`;
	} catch (error) {
		if (isMissingPathError(error)) return null;
		throw error;
	}
}

function safeGetPortsFileSignature(worktreePath: string): string | null {
	try {
		return getPortsFileSignature(worktreePath);
	} catch (error) {
		console.warn("[ports] Failed to stat static port labels:", {
			worktreePath,
			error,
		});
		return null;
	}
}

function readPortsFile(worktreePath: string): string | null {
	try {
		return readFileSync(getPortsPath(worktreePath), "utf-8");
	} catch (error) {
		if (isMissingPathError(error)) return null;
		throw error;
	}
}

function safeLoadLabels(worktreePath: string): Map<number, string> | null {
	try {
		return loadLabels(worktreePath);
	} catch (error) {
		console.warn("[ports] Failed to load static port labels:", {
			worktreePath,
			error,
		});
		return null;
	}
}

/**
 * Read `<worktree>/.superset/ports.json` and return a `port → label` map.
 * Returns null if the file is missing or malformed — this endpoint is a
 * best-effort label hint, not a validator, so parse errors are silent.
 */
function loadLabels(worktreePath: string): Map<number, string> | null {
	const content = readPortsFile(worktreePath);
	if (content === null) return null;

	const parsed = parseStaticPortsConfig(content);
	if (parsed.ports === null) return null;

	const labels = new Map<number, string>();
	for (const port of parsed.ports) {
		labels.set(port.port, port.label);
	}
	return labels;
}

/**
 * Memoize label lookups per workspaceId. Called by host port snapshots and
 * add-event enrichment, so the workspace-root + fs reads would otherwise repeat
 * needlessly. `labels: null` with a resolved worktree means "no labels file" —
 * that negative can stick until the file signature changes. A missing
 * worktreePath is not cached because workspace hydration can race first reads.
 */
const labelCache = new Map<string, LabelCacheEntry>();

function setLabelCache(
	workspaceId: string,
	worktreePath: string | null,
	labels: Map<number, string> | null,
): Map<number, string> | null {
	const portsFileSignature = worktreePath
		? safeGetPortsFileSignature(worktreePath)
		: null;
	labelCache.set(workspaceId, {
		labels,
		portsFileSignature,
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
		if (cached.worktreePath === null) {
			labelCache.delete(workspaceId);
		} else {
			const currentSignature = safeGetPortsFileSignature(cached.worktreePath);
			if (currentSignature === cached.portsFileSignature) return cached.labels;
			return setLabelCache(
				workspaceId,
				cached.worktreePath,
				safeLoadLabels(cached.worktreePath),
			);
		}
	}

	const worktreePath = resolveWorktreePath(workspaceId);
	if (!worktreePath) return null;

	return setLabelCache(workspaceId, worktreePath, safeLoadLabels(worktreePath));
}

export function invalidateLabelCache(workspaceId?: string): void {
	if (workspaceId === undefined) labelCache.clear();
	else labelCache.delete(workspaceId);
}
