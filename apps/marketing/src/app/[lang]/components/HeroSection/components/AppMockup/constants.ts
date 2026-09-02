import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { AgentTab, FileChange, WorkspaceData } from "./types";

export const WORKSPACES: WorkspaceData[] = [
	{
		name: "fix onboarding crash",
		branch: "fix-onboarding-crash",
		add: 46,
		del: 1,
		pr: "#733",
		isActive: true,
		status: "working",
	},
	{
		name: "billing webhooks",
		branch: "billing-webhooks",
		add: 193,
		del: 0,
		pr: "#815",
		status: "review",
	},
	{
		name: "refactor auth flow",
		branch: "refactor-auth-flow",
		add: 394,
		del: 23,
		pr: "#884",
	},
	{
		name: "speed up cold start",
		branch: "speed-up-cold-start",
		add: 33,
		del: 0,
		pr: "#816",
		status: "permission",
	},
	{
		name: "bump dependencies",
		branch: "bump-dependencies",
		add: 127,
		del: 8,
		pr: "#902",
		icon: "branch",
	},
];

export const CLOUD_WORKSPACES: WorkspaceData[] = [
	{
		name: "nightly evals",
		branch: "nightly-evals",
		add: 812,
		del: 64,
		status: "working",
		icon: "cloud",
	},
	{
		name: "api hotfix",
		branch: "api-hotfix",
		add: 12,
		del: 3,
		icon: "cloud",
	},
	{
		name: "docs refresh",
		branch: "docs-refresh",
		add: 58,
		del: 0,
		icon: "cloud",
	},
];

export const FILE_CHANGES: FileChange[] = [
	{ path: "packages/db/src/schema", type: "folder" },
	{ path: "cloud-workspace.ts", add: 119, del: 0, type: "add", indent: 1 },
	{ path: "enums.ts", add: 21, del: 0, type: "edit", indent: 1 },
	{ path: "apps/desktop/src/renderer", type: "folder" },
	{ path: "CloudTerminal.tsx", add: 169, del: 0, type: "add", indent: 1 },
	{ path: "useCloudWorkspaces.ts", add: 84, del: 0, type: "add", indent: 1 },
	{
		path: "LegacyTerminalPane.tsx",
		add: 0,
		del: 42,
		type: "delete",
		indent: 1,
	},
];

export const AGENT_TABS: AgentTab[] = [
	{ src: "/app-icons/codex.svg", alt: "Codex", label: "codex", delay: 0.1 },
	{
		src: "/app-icons/cursor-agent.svg",
		alt: "Cursor",
		label: "cursor",
		delay: 0.2,
	},
	{
		src: "/app-icons/opencode.svg",
		alt: "OpenCode",
		label: "opencode",
		delay: 0.3,
	},
];

export interface AutomationRow {
	name: string;
	schedule: MessageDescriptor;
	lastRun: MessageDescriptor;
	running?: boolean;
}

export const AUTOMATIONS: AutomationRow[] = [
	{
		name: "daily-triage",
		schedule: msg({
			id: "marketing.hero.mockup.schedule.daily",
			message: "daily 9:00",
		}),
		lastRun: msg({
			id: "marketing.hero.mockup.lastRun.running",
			message: "running",
		}),
		running: true,
	},
	{
		name: "changelog-draft",
		schedule: msg({
			id: "marketing.hero.mockup.schedule.sunday",
			message: "sun 11:00",
		}),
		lastRun: msg({
			id: "marketing.hero.mockup.lastRun.twoHoursAgo",
			message: "✓ 2h ago",
		}),
	},
	{
		name: "dep-upgrades",
		schedule: msg({
			id: "marketing.hero.mockup.schedule.weekly",
			message: "weekly",
		}),
		lastRun: msg({
			id: "marketing.hero.mockup.lastRun.oneDayAgo",
			message: "✓ 1d ago",
		}),
	},
	{
		name: "roadmap-sync",
		schedule: msg({
			id: "marketing.hero.mockup.schedule.monthly",
			message: "monthly",
		}),
		lastRun: msg({
			id: "marketing.hero.mockup.lastRun.threeDaysAgo",
			message: "✓ 3d ago",
		}),
	},
];
