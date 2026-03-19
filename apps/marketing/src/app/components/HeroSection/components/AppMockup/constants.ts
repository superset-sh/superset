import type { AgentTab, FileChange, PortGroup, WorkspaceData } from "./types";

export const WORKSPACES: WorkspaceData[] = [
	{
		name: "use any agents",
		branch: "use-any-agents",
		add: 46,
		del: 1,
		pr: "#733",
		isActive: true,
		status: "working",
	},
	{
		name: "create parallel branches",
		branch: "create-parallel-branches",
		add: 193,
		del: 0,
		pr: "#815",
		status: "review",
	},
	{
		name: "see changes",
		branch: "see-changes",
		add: 394,
		del: 23,
		pr: "#884",
	},
	{
		name: "open in any IDE",
		branch: "open-in-any-ide",
		add: 33,
		del: 0,
		pr: "#816",
		status: "permission",
	},
	{
		name: "forward ports",
		branch: "forward-ports",
		add: 127,
		del: 8,
		pr: "#902",
	},
];

export const FILE_CHANGES: FileChange[] = [
	{ path: "bun.lock", add: 38, del: 25, type: "edit" },
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
	{ path: "WorkspaceSidebar.tsx", add: 14, del: 0, type: "edit", indent: 1 },
	{ path: "apps/api/src/trpc/routers", type: "folder" },
	{ path: "ssh-manager.ts", add: 277, del: 0, type: "add", indent: 1 },
	{ path: "index.ts", add: 7, del: 0, type: "edit", indent: 1 },
];

export const PORTS: PortGroup[] = [
	{ workspace: "use any agents", ports: ["3002"] },
	{
		workspace: "see changes",
		ports: ["3000", "3001", "5678"],
	},
];

export const AGENT_TABS: AgentTab[] = [
	{ src: "/app-icons/codex.svg", alt: "Codex", label: "codex", delay: 0.1 },
	{ src: "/app-icons/gemini.svg", alt: "Gemini", label: "gemini", delay: 0.25 },
	{
		src: "/app-icons/cursor-agent.svg",
		alt: "Cursor",
		label: "cursor",
		delay: 0.4,
	},
];

export const SETUP_STEPS = [
	"→ create worktree",
	"→ install deps",
	"→ ready shell",
];
