import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
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

export function processOpenNewResults({
	results,
	showSuccessToast = true,
}: {
	results: MultiResults;
	showSuccessToast?: boolean;
}): CategorizedResults {
	const successes = results.filter(
		(r): r is SuccessOutcome => r.status === "success",
	);
	const needsGitInit = results.filter(
		(r): r is NeedsGitInitOutcome => r.status === "needsGitInit",
	);
	const errors = results.filter((r): r is ErrorOutcome => r.status === "error");

	for (const err of errors) {
		toast.error(
			i18n._({
				...msg({
					message: "Failed to open {name}",
				}),
				values: { name: err.selectedPath.split("/").pop() },
			}),
			{ description: err.error },
		);
	}

	if (showSuccessToast && successes.length > 0) {
		toast.success(
			i18n._({
				...msg({
					message:
						"{count, plural, one {Project opened} other {# projects opened}}",
				}),
				values: { count: successes.length },
			}),
		);
	}

	return { successes, needsGitInit, errors };
}
