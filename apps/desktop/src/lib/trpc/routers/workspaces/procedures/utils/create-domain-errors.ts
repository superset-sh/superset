import { TRPCError } from "@trpc/server";

export type WorkspaceCreateDomainErrorCode =
	| "WORKTREE_ALREADY_EXISTS_FOR_BRANCH"
	| "BRANCH_NOT_FOUND"
	| "GIT_OPERATION_FAILED";

export function throwWorkspaceCreateDomainError(
	code: WorkspaceCreateDomainErrorCode,
	message: string,
	trpcCode: TRPCError["code"] = "BAD_REQUEST",
): never {
	console.warn("[workspaces/create] Domain error", { code, message });
	throw new TRPCError({
		code: trpcCode,
		message: `${code}: ${message}`,
	});
}

export function validateExistingBranchCreate({
	branchName,
	existingBranches,
	existingWorktreePath,
}: {
	branchName: string;
	existingBranches: string[];
	existingWorktreePath: string | null;
}): void {
	if (!existingBranches.includes(branchName)) {
		throwWorkspaceCreateDomainError(
			"BRANCH_NOT_FOUND",
			`Branch "${branchName}" no longer exists.`,
		);
	}

	if (existingWorktreePath) {
		throwWorkspaceCreateDomainError(
			"WORKTREE_ALREADY_EXISTS_FOR_BRANCH",
			`Branch "${branchName}" is already checked out in another worktree.`,
		);
	}
}
