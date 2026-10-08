import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";

export function combinePullRequestReadErrors(
	hostError: unknown,
	cloudError: unknown,
): unknown {
	const data = (hostError as { data?: { code?: unknown } } | null | undefined)
		?.data;
	if (
		hostError === undefined ||
		data?.code === "NOT_FOUND" ||
		isMissingProcedureError(hostError)
	)
		return cloudError;
	const errors = [hostError, cloudError];
	return new AggregateError(
		errors,
		errors.map(rawErrorMessage).filter(Boolean).join("\n"),
	);
}

export function pullRequestReadErrorMessage(error: unknown): string {
	return error instanceof AggregateError
		? error.errors.map((cause) => errorMessage(cause)).join("\n")
		: errorMessage(error);
}
