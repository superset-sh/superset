const ESC = "\x1b";
const ED3_SEQUENCE = `${ESC}[3J`;

/** Strips ESC[3J (clear scrollback) to prevent viewport jumps on reattach. */
export function stripClearScrollbackSequence(data: string): string {
	return data.replaceAll(ED3_SEQUENCE, "");
}
