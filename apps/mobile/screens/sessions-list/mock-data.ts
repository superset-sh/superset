import type { ChatSession, Project, WorkspacePickerEntry } from "./types";

/**
 * Shared fixtures for sessions-list view stories. Mirrors the data shown in
 * `designs/views/01-sessions-list/states/loaded/README.md`.
 */

export const MOCK_PROJECT_NAME = "superset";

export const MOCK_SESSIONS: ChatSession[] = [
	{
		id: "s1",
		title: "Chat-v2 design",
		branch: "chat-mobile-plan",
		hostName: "macbook",
		hostKind: "laptop",
		status: "live",
		statusLabel: "streaming",
		timeLabel: "2m ago",
	},
	{
		id: "s2",
		title: "Migration plan",
		branch: "api-rewrite",
		hostName: "cloud-1",
		hostKind: "cloud",
		status: "live",
		statusLabel: "streaming",
		timeLabel: "5m ago",
	},
	{
		id: "s3",
		title: "API cleanup",
		branch: "chat-mobile-plan",
		hostName: "macbook",
		hostKind: "laptop",
		status: "idle",
		timeLabel: "1h ago",
	},
	{
		id: "s4",
		title: "Auth refactor",
		branch: "main",
		hostName: "desktop",
		hostKind: "laptop",
		status: "warning",
		statusLabel: "pause pending",
		timeLabel: "—",
	},
	{
		id: "s5",
		title: "Hot-fix backport",
		branch: "main",
		hostName: "desktop",
		hostKind: "laptop",
		status: "archived",
		timeLabel: "1d ago",
	},
];

export const MOCK_PROJECTS: Project[] = [
	{ id: "p1", name: "superset", workspaceCount: 4, sessionCount: 12 },
	{ id: "p2", name: "JustinCode", workspaceCount: 1, sessionCount: 2 },
	{ id: "p3", name: "LaneShadow", workspaceCount: 2, sessionCount: 0 },
];

export const MOCK_WORKSPACES_FOR_NEW_CHAT: WorkspacePickerEntry[] = [
	{
		id: "w1",
		branch: "chat-mobile-plan",
		hostName: "macbook",
		hostKind: "laptop",
		sessionCount: 5,
		lastActiveTimeLabel: "2m ago",
	},
	{
		id: "w2",
		branch: "api-rewrite",
		hostName: "cloud-1",
		hostKind: "cloud",
		sessionCount: 3,
		lastActiveTimeLabel: "1h ago",
	},
	{
		id: "w3",
		branch: "main",
		hostName: "macbook",
		hostKind: "laptop",
		sessionCount: 2,
		lastActiveTimeLabel: "yesterday",
	},
	{
		id: "w4",
		branch: "main",
		hostName: "desktop",
		hostKind: "laptop",
		sessionCount: 1,
		lastActiveTimeLabel: "3 days ago",
	},
	{
		id: "w5",
		branch: "feature-x",
		hostName: "cloud-1",
		hostKind: "cloud",
		sessionCount: 0,
	},
];

export const MOCK_FILTER_WORKSPACES = [
	{
		id: "fw1",
		branch: "chat-mobile-plan",
		hostName: "macbook",
		hostKind: "laptop" as const,
	},
	{
		id: "fw2",
		branch: "api-rewrite",
		hostName: "cloud-1",
		hostKind: "cloud" as const,
	},
	{
		id: "fw3",
		branch: "main",
		hostName: "macbook",
		hostKind: "laptop" as const,
	},
	{
		id: "fw4",
		branch: "main",
		hostName: "desktop",
		hostKind: "laptop" as const,
	},
	{
		id: "fw5",
		branch: "feature-x",
		hostName: "cloud-1",
		hostKind: "cloud" as const,
	},
];
