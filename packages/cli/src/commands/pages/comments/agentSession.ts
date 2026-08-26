export function agentSessionId(): string | undefined {
	return process.env.SUPERSET_PANE_ID || process.env.SUPERSET_TERMINAL_ID;
}
