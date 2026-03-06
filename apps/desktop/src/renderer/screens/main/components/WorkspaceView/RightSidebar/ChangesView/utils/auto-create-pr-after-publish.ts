interface AutoCreatePRAfterPublishInput {
	hasExistingPR: boolean;
	isDefaultBranch: boolean;
}

export function shouldAutoCreatePRAfterPublish({
	hasExistingPR,
	isDefaultBranch,
}: AutoCreatePRAfterPublishInput): boolean {
	return !hasExistingPR && !isDefaultBranch;
}
