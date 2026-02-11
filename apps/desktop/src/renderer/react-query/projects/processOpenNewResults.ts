import { toast } from "@superset/ui/sonner";
import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";

type OpenNewResult = ElectronRouterOutputs["projects"]["openNew"];

type MultiResults = Extract<OpenNewResult, { multi: true }>["results"];

type SuccessOutcome = Extract<MultiResults[number], { status: "success" }>;
type NeedsGitInitOutcome = Extract<
	MultiResults[number],
	{ status: "needsGitInit" }
>;
type ErrorOutcome = Extract<MultiResults[number], { status: "error" }>;

export interface CategorizedResults {
	successes: SuccessOutcome[];
	needsGitInit: NeedsGitInitOutcome[];
	errors: ErrorOutcome[];
}

/** Categorizes open-project results and shows appropriate toasts. */
export function processOpenNewResults({
	results,
	showSuccessToast = true,
	showGitInitToast = false,
}: {
	results: MultiResults;
	showSuccessToast?: boolean;
	showGitInitToast?: boolean;
}): CategorizedResults {
	const successes = results.filter(
		(r): r is SuccessOutcome => r.status === "success",
	);
	const needsGitInit = results.filter(
		(r): r is NeedsGitInitOutcome => r.status === "needsGitInit",
	);
	const errors = results.filter((r): r is ErrorOutcome => r.status === "error");

	for (const err of errors) {
		toast.error(`Failed to open ${err.selectedPath.split("/").pop()}`, {
			description: err.error,
		});
	}

	if (showSuccessToast && successes.length > 0) {
		toast.success(
			successes.length === 1
				? "Project opened"
				: `${successes.length} projects opened`,
		);
	}

	if (showGitInitToast && needsGitInit.length > 0) {
		const names = needsGitInit
			.map((r) => r.selectedPath.split("/").pop())
			.join(", ");
		toast.error(
			needsGitInit.length === 1
				? "Folder is not a git repository"
				: `${needsGitInit.length} folders are not git repositories`,
			{
				description: `${names} - use 'Open project' from the start view to initialize git.`,
			},
		);
	}

	return { successes, needsGitInit, errors };
}
