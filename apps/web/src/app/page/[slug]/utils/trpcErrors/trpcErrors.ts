import { TRPCClientError } from "@trpc/client";

function hasCode(error: unknown, code: string): boolean {
	// TRPCClientError sets `data` to `shape.data`, so checking one covers both.
	return error instanceof TRPCClientError && error.data?.code === code;
}

export const isNotFound = (error: unknown) => hasCode(error, "NOT_FOUND");
export const isForbidden = (error: unknown) => hasCode(error, "FORBIDDEN");
