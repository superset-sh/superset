export interface AgentEventTarget {
	workspaceId: string;
	terminalId: string;
}

export function agentEventTarget(data: unknown): AgentEventTarget | null {
	if (!data || typeof data !== "object") return null;
	const { workspaceId, terminalId } = data as Record<string, unknown>;
	if (typeof workspaceId !== "string" || typeof terminalId !== "string") {
		return null;
	}
	return { workspaceId, terminalId };
}

export function agentEventHref({ workspaceId, terminalId }: AgentEventTarget) {
	return `/(authenticated)/workspace/${encodeURIComponent(workspaceId)}?tab=${encodeURIComponent(terminalId)}`;
}

export function isViewingWorkspace(
	pathname: string,
	{ workspaceId }: AgentEventTarget,
): boolean {
	return pathname === `/workspace/${workspaceId}`;
}
