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
