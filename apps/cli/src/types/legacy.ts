/**
 * Legacy types used by the lowdb storage layer.
 * These are kept for backward compatibility with the agent commands.
 */

export interface Environment {
	id: string;
}

export interface Change {
	id: string;
	workspaceId: string;
	summary?: string;
	createdAt: Date;
}

export interface FileDiff {
	id: string;
	changeId: string;
	path: string;
	status: string;
	additions: number;
	deletions: number;
}

export interface AgentSummary {
	id: string;
	agentId: string;
	summary: string;
	createdAt: Date;
}
