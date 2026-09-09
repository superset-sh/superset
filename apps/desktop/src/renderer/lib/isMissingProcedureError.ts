/**
 * True when a tRPC call reached a host that does not know the procedure.
 * Remote hosts and cloud sandboxes can lag the desktop version, so callers
 * use this only to select an explicit legacy transport.
 */
export function isMissingProcedureError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const message = (error as { message?: unknown }).message;
	return (
		typeof message === "string" &&
		/no procedure found|procedure .* not found on server/i.test(message)
	);
}
