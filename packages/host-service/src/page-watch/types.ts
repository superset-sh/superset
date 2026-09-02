export interface PageWatchAssignment {
	pageId: string;
	slug: string;
	title: string;
	workspaceId: string;
	terminalId: string;
	agentId: string | null;
}

export interface PageWatchEntry extends PageWatchAssignment {
	assignedAt: number;
	cursor: number;
	lastHumanCommentAt: number;
	lastHeartbeatAt: number;
	failures: number;
	pings: Map<string, number>;
	pendingSince: number | null;
}

export interface WatchedThreadComment {
	id: string;
	body: string;
	authorKind: "human" | "agent";
	authorName: string;
	createdAt: Date;
}

export interface WatchedThread {
	id: string;
	anchorKind: "element" | "text" | "page";
	anchor: { path: string; tag: string } | null;
	anchorText: string | null;
	resolved: boolean;
	version: number;
	comments: WatchedThreadComment[];
}

export interface PageWatchStatus {
	pageId: string;
	slug: string;
	title: string;
	workspaceId: string;
	terminalId: string;
	agentId: string | null;
	assignedAt: number;
	lastHumanCommentAt: number;
	pendingSince: number | null;
}
