// The pool gives up on a task on purpose in three situations: host-service
// shutdown, a newer request superseding this one, and the caller's signal
// firing — which tRPC does for us the moment the desktop drops the
// connection, so closing a pane cancels the batch it was still waiting on.
// None of the three is a failure, but all three used to reach the boundary
// as INTERNAL_SERVER_ERROR, the one code sentryMiddleware reports on.

import { TRPCError } from "@trpc/server";
import {
	type WorkerTaskAbortedError,
	WorkerTaskError,
} from "../workers/WorkerTaskRunner";

/**
 * Reclassify a deliberate abort; leave every other rejection alone so it
 * keeps its 500. Timeouts, worker crashes, and errors thrown by the task
 * handler itself all stay reported.
 */
export function rethrowWorkerTaskAbort(error: unknown): void {
	// Anything that crossed the worker boundary arrives as a WorkerTaskError
	// carrying the original `name`, so a handler that threw something named
	// like our abort can never be mistaken for one. Checking the class first
	// is what keeps the name check below honest.
	if (error instanceof WorkerTaskError) return;
	if (!(error instanceof Error)) return;
	if (error.name !== "WorkerTaskAbortedError") return;

	const kind = (error as WorkerTaskAbortedError).kind;
	switch (kind) {
		case "disposed":
			// The host is on its way down and the client is still there: the
			// renderer retries SERVICE_UNAVAILABLE, so the query survives the
			// restart instead of settling into a permanent error.
			throw new TRPCError({
				code: "SERVICE_UNAVAILABLE",
				message: error.message,
			});
		case "superseded":
		case "cancelled":
			throw new TRPCError({
				code: "CLIENT_CLOSED_REQUEST",
				message: error.message,
			});
		default: {
			// A new kind must be classified deliberately; until it is, the
			// build fails here and the runtime keeps reporting it.
			const exhaustive: never = kind;
			throw new Error(`Unhandled worker abort kind: ${exhaustive}`, {
				cause: error,
			});
		}
	}
}
