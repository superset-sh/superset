import { DrizzleQueryError } from "drizzle-orm";

/**
 * An error's message with no bind parameters in it.
 *
 * Drizzle builds a DrizzleQueryError's message as the statement text followed
 * by every bind parameter, so `error.message` on a failed query is unsafe to
 * store or report: on the ingest paths one of those parameters is the whole
 * webhook body, which would put a third party's payload into an error column
 * and into the error tracker. The driver error underneath carries the same
 * diagnosis — code, severity, what the database actually said — without them.
 */
export function databaseErrorMessage(error: unknown): string {
	if (error instanceof DrizzleQueryError) {
		return error.cause instanceof Error
			? error.cause.message
			: "unknown database error";
	}
	return error instanceof Error ? error.message : "Unknown error";
}
