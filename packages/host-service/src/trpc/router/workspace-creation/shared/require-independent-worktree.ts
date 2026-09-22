import { TRPCError } from "@trpc/server";
import { normalizeWorktreePath } from "./worktree-list";

export function requireIndependentWorktree(
	repoPath: string,
	worktreePath: string,
) {
	if (normalizeWorktreePath(repoPath) === normalizeWorktreePath(worktreePath)) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"This branch uses the project's shared checkout. Create a Local workspace or choose another branch for a worktree.",
		});
	}
}
