export const TERMINAL_ATTACH_CANCELED_MESSAGE = "TERMINAL_ATTACH_CANCELED";

export function isTerminalAttachCanceledMessage(message?: string): boolean {
	return message?.includes(TERMINAL_ATTACH_CANCELED_MESSAGE) ?? false;
}
