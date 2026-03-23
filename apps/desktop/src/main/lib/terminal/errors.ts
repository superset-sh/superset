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
