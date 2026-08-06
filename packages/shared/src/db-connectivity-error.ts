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

/** Key set on tRPC's `errorFormatter` `data` field — shared so the client
 * doesn't have to re-declare the same shape by hand when reading it back. */
export const DATABASE_UNAVAILABLE_DATA_KEY = "databaseUnavailable" as const;

export interface DatabaseUnavailableErrorData {
	[DATABASE_UNAVAILABLE_DATA_KEY]?: boolean;
}
