import type { V2WorkspaceUrlOpenTarget } from "../../../../utils/openUrlInV2Workspace";

export interface OpenFileSearchParams {
	openFile?: string[];
	openFileLine?: number;
	openFileTarget?: V2WorkspaceUrlOpenTarget;
	openFileRequestId?: string;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** One path arrives as a bare string, several as an array; both become a list. */
function parsePaths(value: unknown): string[] | undefined {
	const candidates = Array.isArray(value) ? value : [value];
	const paths = candidates.filter(
		(item): item is string => typeof item === "string" && item.length > 0,
	);
	return paths.length > 0 ? paths : undefined;
}

function parseLine(value: unknown): number | undefined {
	const line = typeof value === "string" ? Number(value) : value;
	return typeof line === "number" && Number.isInteger(line) && line >= 1
		? line
		: undefined;
}

function parseTarget(value: unknown): V2WorkspaceUrlOpenTarget | undefined {
	if (value === "current-tab" || value === "new-tab") return value;
	return undefined;
}

/** The file-open request's own fields from a raw search object, sanitized, for validateSearch. */
export function readOpenFileSearch(
	raw: Record<string, unknown>,
): OpenFileSearchParams {
	return {
		openFile: parsePaths(raw.openFile),
		openFileLine: parseLine(raw.openFileLine),
		openFileTarget: parseTarget(raw.openFileTarget),
		openFileRequestId: nonEmptyString(raw.openFileRequestId),
	};
}
