import type { TerminalSpawnFailureCause } from "../terminal-host/types";

export const TERMINAL_SESSION_KILLED_MESSAGE = "TERMINAL_SESSION_KILLED";
export const TERMINAL_ATTACH_CANCELED_MESSAGE = "TERMINAL_ATTACH_CANCELED";

export class TerminalKilledError extends Error {
	constructor() {
		super(TERMINAL_SESSION_KILLED_MESSAGE);
		this.name = "TerminalKilledError";
	}
}

export class TerminalAttachCanceledError extends Error {
	constructor() {
		super(TERMINAL_ATTACH_CANCELED_MESSAGE);
		this.name = "TerminalAttachCanceledError";
	}
}

export function isTerminalAttachCanceledError(error: unknown): boolean {
	return (
		error instanceof TerminalAttachCanceledError ||
		(error instanceof Error &&
			error.message === TERMINAL_ATTACH_CANCELED_MESSAGE)
	);
}

/**
 * The terminal host could not bring a PTY up for createOrAttach. Thrown by
 * the daemon, serialized as `error.cause` on the socket, and rebuilt by the
 * client so the tRPC router can switch on `cause.kind`.
 */
export class TerminalSpawnFailedError extends Error {
	override readonly cause: TerminalSpawnFailureCause;

	constructor(cause: TerminalSpawnFailureCause) {
		super(describeTerminalSpawnFailure(cause));
		this.name = "TerminalSpawnFailedError";
		this.cause = cause;
	}
}

export function isTerminalSpawnFailedError(
	error: unknown,
): error is TerminalSpawnFailedError {
	return (
		error instanceof Error &&
		error.name === "TerminalSpawnFailedError" &&
		typeof (error.cause as { kind?: unknown } | undefined)?.kind === "string"
	);
}

const FIRST_LINE_MAX_CHARS = 200;

export function describeTerminalSpawnFailure(
	cause: TerminalSpawnFailureCause,
): string {
	switch (cause.kind) {
		case "SHELL_EXITED": {
			const signal = cause.signal ? ` (signal ${cause.signal})` : "";
			const firstLine = firstOutputLine(cause.outputHead);
			return `Your shell (${cause.shell}) exited immediately with code ${cause.exitCode}${signal}${firstLine ? `: ${firstLine}` : ""}`;
		}
		case "PTY_SPAWN_FAILED":
			return `Could not open a PTY for ${cause.shell}: ${cause.error ?? `PTY helper exited with code ${cause.exitCode}`}`;
		case "PTY_SPAWN_TIMEOUT":
			return `Timed out waiting for a PTY for ${cause.shell}`;
	}
}

// CSI, OSC (BEL- or ST-terminated), other two-byte escapes, then remaining
// control characters. Shell startup errors are plain text underneath.
const TERMINAL_ESCAPES =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping terminal control sequences
	/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|[\x00-\x08\x0b-\x1f\x7f]/g;

function firstOutputLine(outputHead: string): string {
	const line = outputHead
		.replace(TERMINAL_ESCAPES, "")
		.split(/\r?\n|\r/)
		.map((part) => part.trim())
		.find((part) => part.length > 0);
	return line ? line.slice(0, FIRST_LINE_MAX_CHARS) : "";
}
