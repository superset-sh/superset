export const TERMINAL_SESSION_KILLED_MESSAGE = "TERMINAL_SESSION_KILLED";

export class TerminalKilledError extends Error {
	constructor() {
		super(TERMINAL_SESSION_KILLED_MESSAGE);
		this.name = "TerminalKilledError";
	}
}
