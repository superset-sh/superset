import { TRPCClientError } from "@trpc/client";

/** Direct disconnects and relay failures while the host reconnects are retryable. */
export function isHostServiceConnectionError(error: unknown): boolean {
	if (!(error instanceof TRPCClientError)) return false;
	// The relay sends valid tRPC error envelopes when the host is offline or
	// its reverse tunnel cannot dial. Those have data despite being transport
	// failures. Auth, validation, and missing-procedure errors remain terminal.
	return (
		error.data == null ||
		error.data.code === "SERVICE_UNAVAILABLE" ||
		error.data.code === "BAD_GATEWAY"
	);
}
