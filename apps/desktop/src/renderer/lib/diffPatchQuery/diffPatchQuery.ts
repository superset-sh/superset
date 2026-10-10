import type { AppRouter } from "@superset/host-service";
import type { QueryKey } from "@tanstack/react-query";
import type { inferRouterInputs } from "@trpc/server";

export type GetDiffPatchInput =
	inferRouterInputs<AppRouter>["git"]["getDiffPatch"];

/** The query key holds what is diffed; the path lists travel in the input only. */
export type DiffPatchScope = Omit<
	GetDiffPatchInput,
	"paths" | "untrackedPaths"
>;

export function toDiffPatchScope(input: GetDiffPatchInput): DiffPatchScope {
	const { paths: _paths, untrackedPaths: _untrackedPaths, ...scope } = input;
	return scope;
}

interface DiffPatchQueryLike {
	queryKey: QueryKey;
	state: { data?: unknown };
}

/** Whether a worktree-only `git:changed` for `changedPaths` can have moved
 * this query's patch. Unstaged always: any write can add a file to it. */
export function isDiffPatchQueryAffected(
	query: DiffPatchQueryLike,
	changedPaths: readonly string[],
): boolean {
	if (readScope(query.queryKey)?.category === "unstaged") return true;
	const paths = readRequestedPaths(query.state.data);
	if (!paths) return true;
	return changedPaths.some((path) => paths.includes(path));
}

function readScope(queryKey: QueryKey): Partial<DiffPatchScope> | undefined {
	const options = queryKey[1];
	if (typeof options !== "object" || options === null) return undefined;
	return (options as { input?: Partial<DiffPatchScope> }).input;
}

function readRequestedPaths(data: unknown): string[] | undefined {
	if (typeof data !== "object" || data === null) return undefined;
	const paths = (data as { requestedPaths?: unknown }).requestedPaths;
	return Array.isArray(paths) ? (paths as string[]) : undefined;
}
