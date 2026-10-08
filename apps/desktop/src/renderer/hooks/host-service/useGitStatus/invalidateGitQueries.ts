import type {
	GitChangedPayload,
	workspaceTrpc,
} from "@superset/workspace-client";
import { isDiffPatchQueryAffected } from "renderer/lib/diffPatchQuery";

type GitUtils = Pick<
	ReturnType<typeof workspaceTrpc.useUtils>["git"],
	"getDiffPatch" | "getDiff" | "getBaseBranch" | "listCommits"
>;

export function invalidateGitQueries(
	git: GitUtils,
	workspaceId: string,
	payload?: GitChangedPayload,
): void {
	const paths = payload?.paths;
	if (paths && paths.length > 0) {
		// Patch keys name what is diffed, not which files, so an edit
		// to an already-changed file leaves cached hunks behind while
		// `loadDiffFiles` reads the file as it is now. Refetch the
		// patches the write can have moved and leave the rest cached.
		void git.getDiffPatch.invalidate(
			{ workspaceId },
			{ predicate: (query) => isDiffPatchQueryAffected(query, paths) },
		);
		for (const path of paths) {
			void git.getDiff.invalidate({ workspaceId, path });
		}
		return;
	}
	void git.getDiffPatch.invalidate({ workspaceId });
	void git.getDiff.invalidate({ workspaceId });
	// Current branch may have changed (external checkout), and
	// branch.<name>.base is per-branch — drop the cache so the next read
	// picks up the new branch's base.
	void git.getBaseBranch.invalidate({ workspaceId });
	// A metadata-only change can move HEAD (for example, an agent
	// committing outside the app), so refresh cached commit lists too.
	void git.listCommits.invalidate({ workspaceId });
}
