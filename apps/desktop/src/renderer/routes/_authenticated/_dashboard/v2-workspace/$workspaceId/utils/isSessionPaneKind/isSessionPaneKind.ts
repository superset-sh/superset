const SESSION_PANE_KINDS: ReadonlySet<string> = new Set([
	"terminal",
	"chat-v3",
]);

export function isSessionPaneKind(kind: string): boolean {
	return SESSION_PANE_KINDS.has(kind);
}
