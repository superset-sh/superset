import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";

function trpcErrorCode(error: unknown): string | undefined {
	const data = (error as { data?: { code?: unknown } } | null | undefined)
		?.data;
	return typeof data?.code === "string" ? data.code : undefined;
}

/** An answer of "not here", which the next source may still have had. */
function isQuiet(error: unknown): boolean {
	const code = trpcErrorCode(error);
	return (
		isMissingProcedureError(error) ||
		code === "NOT_FOUND" ||
		code === "PRECONDITION_FAILED"
	);
}

/** What to show when every source failed: the real failures, or the last miss when that is all there was. */
export function combinePullRequestErrors(errors: unknown[]): unknown {
	const loud = errors.filter((error) => !isQuiet(error));
	const kept = loud.length > 0 ? loud : errors.slice(-1);
	if (kept.length === 1) return kept[0];
	return new AggregateError(
		kept,
		kept.map(rawErrorMessage).filter(Boolean).join("\n"),
	);
}

export function pullRequestReadErrorMessage(error: unknown): string {
	return error instanceof AggregateError
		? error.errors.map((cause) => errorMessage(cause)).join("\n")
		: errorMessage(error);
}
