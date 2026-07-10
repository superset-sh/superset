import { TRPCClientError } from "@trpc/client";

/** tRPC error code (e.g. "CONFLICT", "PRECONDITION_FAILED") or null. */
export function getTrpcErrorCode(error: unknown): string | null {
	if (!(error instanceof TRPCClientError)) return null;
	const data = error.data as { code?: unknown } | undefined;
	return typeof data?.code === "string" ? data.code : null;
}
