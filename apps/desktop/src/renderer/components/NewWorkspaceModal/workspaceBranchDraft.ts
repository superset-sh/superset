import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";

interface ResolveWorkspaceBranchDraftInput {
	title: string;
	branchName: string;
	branchNameEdited: boolean;
}

export function resolveWorkspaceBranchDraft({
	title,
	branchName,
	branchNameEdited,
}: ResolveWorkspaceBranchDraftInput): {
	branchSlug: string;
	applyPrefix: boolean;
} {
	const source = branchNameEdited ? branchName : title.trim();

	return {
		branchSlug: sanitizeBranchNameWithMaxLength(source),
		applyPrefix: !branchNameEdited,
	};
}
