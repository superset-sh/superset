import { TRPCError } from "@trpc/server";
import type { TerminalSessionError } from "../../../terminal/terminal";

/**
 * Single tRPC mapping for every terminal session failure.
 *
 * The switch is exhaustive: adding a kind to `TerminalSessionErrorKind`
 * without deciding its code here is a type error, which is the point. Only
 * TERMINAL_START_FAILED stays a 500, so it is the only kind the Sentry
 * middleware reports.
 */
export function toTerminalSessionError(
	failure: TerminalSessionError,
): TRPCError {
	const { kind, error: message } = failure;
	switch (kind) {
		case "SESSION_WRONG_WORKSPACE":
			return new TRPCError({ code: "FORBIDDEN", message, cause: { kind } });
		case "SESSION_NOT_FOUND":
		case "SESSION_EXITED":
		case "SESSION_NOT_ACTIVE":
		case "WORKSPACE_NOT_FOUND":
		case "WORKTREE_GONE":
			return new TRPCError({ code: "NOT_FOUND", message, cause: { kind } });
		case "DAEMON_UNAVAILABLE":
			return new TRPCError({
				code: "SERVICE_UNAVAILABLE",
				message,
				cause: { kind },
			});
		case "TERMINAL_START_FAILED":
			return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
		default: {
			const unhandled: never = kind;
			return new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Unhandled terminal session error kind: ${String(unhandled)}`,
			});
		}
	}
}
