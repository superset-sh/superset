export interface SetupImportOfferTarget {
	hostUrl: string;
	projectId: string;
	projectName: string;
}

export interface SetupImportOfferDeps {
	/** Only the org's last-focused window asks, so other windows stay quiet. */
	isPromptWindow: () => Promise<boolean>;
	waitForFocus: (signal: AbortSignal) => Promise<void>;
	isDismissed: (projectId: string) => boolean;
	/** No Superset scripts yet, and another tool's setup would change that. */
	hasImport: (target: SetupImportOfferTarget) => Promise<boolean>;
	prompt: (target: SetupImportOfferTarget) => void;
}

export async function offerSetupImport(
	target: SetupImportOfferTarget,
	deps: SetupImportOfferDeps,
	signal: AbortSignal,
): Promise<void> {
	if (!(await deps.isPromptWindow())) return;
	await deps.waitForFocus(signal);
	if (signal.aborted || deps.isDismissed(target.projectId)) return;
	if (!(await deps.hasImport(target)) || signal.aborted) return;
	deps.prompt(target);
}
