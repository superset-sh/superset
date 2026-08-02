/**
 * Detects a raw DB-driver connectivity failure (Postgres/Neon proxy
 * unreachable — the common "forgot to start the local Docker DB stack"
 * dev-environment mistake) so callers can surface a clear message instead
 * of an opaque generic error.
 */
export function isDatabaseConnectivityError(error: unknown): boolean {
	const text =
		error instanceof Error
			? `${error.name} ${error.message} ${String(error.cause ?? "")}`
			: String(error);
	return /ECONNREFUSED|NeonDbError|Unable to connect/i.test(text);
}

export const DATABASE_UNAVAILABLE_MESSAGE =
	"Could not reach the database. Is your local dev DB stack (Docker) running?";
