export type PrimaryActionType = "commit" | "sync" | "push" | "pull";

export interface PrimaryActionInput {
	canCommit: boolean;
	hasStagedChanges: boolean;
	isPending: boolean;
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
	hasExistingPR: boolean;
}

export interface PrimaryActionState {
	action: PrimaryActionType;
	label: string;
	disabled: boolean;
	tooltip: string;
}

export function getPrimaryAction({
	canCommit,
	hasStagedChanges,
	isPending,
	pushCount,
	pullCount,
	hasUpstream,
	hasExistingPR,
}: PrimaryActionInput): PrimaryActionState {
	if (canCommit) {
		return {
			action: "commit",
			label: "Commit",
			disabled: isPending,
			tooltip: "Commit staged changes",
		};
	}

	if (pushCount > 0 && pullCount > 0) {
		return {
			action: "sync",
			label: "Sync",
			disabled: isPending,
			tooltip: `Pull ${pullCount}, push ${pushCount}`,
		};
	}

	if (pushCount > 0) {
		return {
			action: "push",
			label: "Push",
			disabled: isPending,
			tooltip: `Push ${pushCount} commit${pushCount !== 1 ? "s" : ""}`,
		};
	}

	if (pullCount > 0) {
		return {
			action: "pull",
			label: "Pull",
			disabled: isPending,
			tooltip: `Pull ${pullCount} commit${pullCount !== 1 ? "s" : ""}`,
		};
	}

	if (!hasUpstream) {
		return {
			action: "push",
			label: hasExistingPR ? "Push" : "Publish Branch",
			disabled: isPending,
			tooltip: hasExistingPR
				? "Push branch changes"
				: "Publish branch to remote",
		};
	}

	return {
		action: "commit",
		label: "Commit",
		disabled: true,
		tooltip: hasStagedChanges ? "Enter a message" : "No staged changes",
	};
}
