const backgroundTerminalIds = new Set<string>();

export function markTerminalForBackground(terminalId: string): void {
	backgroundTerminalIds.add(terminalId);
}

export function consumeTerminalBackgroundIntent(terminalId: string): boolean {
	return backgroundTerminalIds.delete(terminalId);
}
