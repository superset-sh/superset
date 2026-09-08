import { TRPCError } from "@trpc/server";
import {
	type ForbiddenRootReason,
	forbiddenRootReason,
} from "../../../../runtime/filesystem/watch-root-policy";

function importRefusalMessage(
	reason: ForbiddenRootReason,
	repoPath: string,
): string {
	switch (reason) {
		case "home-directory":
			return `${repoPath} is your home directory. Superset would watch and index everything under it; pick the repository folder itself.`;
		case "filesystem-root":
			return `${repoPath} is the root of the disk. Pick the repository folder itself.`;
		case "contains-superset-home":
			return `${repoPath} contains Superset's own data folder, so every workspace would be watched twice. Pick the repository folder itself.`;
	}
}

/** Apply the same refusal during discovery and before import can mutate disk. */
export function assertImportRootAllowed(repoPath: string): void {
	const reason = forbiddenRootReason(repoPath);
	if (reason) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: importRefusalMessage(reason, repoPath),
		});
	}
}
