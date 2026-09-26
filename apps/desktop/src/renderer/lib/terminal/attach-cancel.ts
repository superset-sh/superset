export const TERMINAL_ATTACH_CANCELED_MESSAGE = "TERMINAL_ATTACH_CANCELED";
export const TERMINAL_SESSION_KILLED_MESSAGE = "TERMINAL_SESSION_KILLED";

export function isTerminalAttachCanceledMessage(message?: string): boolean {
	return message?.includes(TERMINAL_ATTACH_CANCELED_MESSAGE) ?? false;
}

export function isTerminalSessionKilledMessage(message?: string): boolean {
	return message?.includes(TERMINAL_SESSION_KILLED_MESSAGE) ?? false;
}

/**
 * Both sentinels mean the same thing to anything launching into a pane: the
 * pane went away before its session came up. They are backend protocol strings,
 * never display text, so a user-facing surface must map them to prose rather
 * than render `result.error` directly.
 */
export function isPaneGoneBeforeStartMessage(message?: string): boolean {
	return (
		isTerminalAttachCanceledMessage(message) ||
		isTerminalSessionKilledMessage(message)
	);
}
