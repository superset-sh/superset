export interface Change {
	id: string;
	workspaceId: string;
	summary: string;
	createdAt: Date;
}

export interface FileDiff {
	id: string;
	changeId: string;
	path: string;
	/** Previous file path (only for renames) */
	oldPath?: string;
	status: "added" | "modified" | "deleted" | "renamed" | "copied";
	additions: number;
	deletions: number;
	/** Unified diff patch content to display */
	patch?: string;
	/** Git blob SHA hash (for verifying file integrity) */
	sha?: string;
	/** External URL to view the file (e.g., GitHub blob URL) */
	blobUrl?: string;
}

export interface AgentSummary {
	id: string;
	agentId: string;
	summary: string;
	createdAt: Date;
}

export interface ChangeOrchestrator {
	list: (workspaceId: string) => Promise<Change[]>;
	create: (change: Omit<Change, "id" | "timestamp">) => Promise<Change>;
	update: (id: string, change: Partial<Change>) => Promise<void>;
	delete: (id: string) => Promise<void>;
}
