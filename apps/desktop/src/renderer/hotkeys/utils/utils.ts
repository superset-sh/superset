/** Check if a KeyboardEvent matches a terminal-reserved chord */
const TERMINAL_RESERVED = new Set([
	"ctrl+c",
	"ctrl+d",
	"ctrl+z",
	"ctrl+s",
	"ctrl+q",
	"ctrl+\\",
]);

export function isTerminalReservedEvent(event: KeyboardEvent): boolean {
	if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
		return false;
	const key = event.key.toLowerCase();
	return TERMINAL_RESERVED.has(`ctrl+${key}`);
}
