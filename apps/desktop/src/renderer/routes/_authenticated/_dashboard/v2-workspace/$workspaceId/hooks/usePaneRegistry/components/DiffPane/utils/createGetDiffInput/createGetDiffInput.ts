import type { AppRouter } from "@superset/host-service";
import type { inferRouterInputs } from "@trpc/server";
import type { ChangesetFile } from "../../../../../useChangeset";

type GetDiffInput = inferRouterInputs<AppRouter>["git"]["getDiff"];

/** The `git.getDiff` input for one file, matching the ref pair its patch was
 * generated from. Used to hydrate a partial diff with full file contents when
 * someone expands context or edits. */
export function createGetDiffInput(
	workspaceId: string,
	file: ChangesetFile,
): GetDiffInput {
	const { source } = file;
	if (source.kind === "against-base") {
		return {
			workspaceId,
			path: file.path,
			category: "against-base",
			baseBranch: source.baseBranch ?? undefined,
		};
	}
	if (source.kind === "commit") {
		return {
			workspaceId,
			path: file.path,
			category: "commit",
			commitHash: source.commitHash,
			fromHash: source.fromHash,
		};
	}
	return {
		workspaceId,
		path: file.path,
		category: source.kind,
	};
}
