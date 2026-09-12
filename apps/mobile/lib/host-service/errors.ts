import { TRPCClientError } from "@trpc/client";

interface HostServiceErrorData {
	code?: string;
	deleteInProgress?: unknown;
	teardownFailure?: unknown;
}

export function isTrpcErrorWithData(
	error: unknown,
): error is { data: HostServiceErrorData } {
	return (
		error instanceof TRPCClientError &&
		typeof error.data === "object" &&
		error.data !== null
	);
}

/**
 * The host is older than the procedure being called. Mobile ships through
 * the App Store and hosts update on their own schedule, so a call the app
 * knows about and the host does not is a routine state to name, not a fault
 * to report.
 */
export function isMissingProcedureError(error: unknown): boolean {
	return (
		error instanceof TRPCClientError &&
		/no procedure found on path/i.test(error.message)
	);
}
