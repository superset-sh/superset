import { TRPCError } from "@trpc/server";
import type { TerminalSpawnFailedError } from "main/lib/terminal/errors";

/**
 * Single tRPC mapping for a PTY that never became ready.
 *
 * The switch is exhaustive: adding a kind to `TerminalSpawnFailureCause`
 * without deciding its code here is a type error. Only SHELL_EXITED is the
 * user's environment (their shell ran and died); the other kinds mean the
 * PTY helper itself failed, which stays a 500 so Sentry keeps reporting it.
 */
export function toTerminalSpawnError(
	error: TerminalSpawnFailedError,
): TRPCError {
	const { cause } = error;
	switch (cause.kind) {
		case "SHELL_EXITED":
			return new TRPCError({
				code: "PRECONDITION_FAILED",
				message: error.message,
				cause,
			});
		case "PTY_SPAWN_FAILED":
		case "PTY_SPAWN_TIMEOUT":
			return new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: error.message,
				cause: error,
			});
		default: {
			const unhandled: never = cause;
			return new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Unhandled terminal spawn failure kind: ${String(unhandled)}`,
			});
		}
	}
}
