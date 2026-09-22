const cancelledTerminalIds = new Set<string>();

export function markTerminalReplacementCancelled(terminalId: string): void {
	cancelledTerminalIds.add(terminalId);
}

export function isTerminalReplacementCancelled(terminalId: string): boolean {
	return cancelledTerminalIds.has(terminalId);
}
