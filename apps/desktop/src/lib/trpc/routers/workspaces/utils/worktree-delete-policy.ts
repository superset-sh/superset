import type { SelectWorktree } from "@superset/local-db";

export function shouldRemoveWorktreeDirectory(
	worktree: Pick<SelectWorktree, "createdBySuperset">,
): boolean {
	return worktree.createdBySuperset;
}
