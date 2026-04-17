import type { AgentType } from "@superset/shared/agent-command";

export type SupersetManagedBinary = AgentType | "droid";

export const DESKTOP_AGENT_SETUP_ACTIONS = [
	"notify-script",
	"cleanup-global-opencode-plugin",
	"amp-wrapper",
	"claude-settings-json",
	"claude-wrapper",
	"codex-hooks-json",
	"codex-wrapper",
	"droid-wrapper",
	"droid-settings-json",
	"opencode-plugin",
	"opencode-wrapper",
	"cursor-hook-script",
	"cursor-agent-wrapper",
	"cursor-hooks-json",
	"gemini-hook-script",
	"gemini-wrapper",
	"gemini-settings-json",
	"mastra-wrapper",
	"mastra-hooks-json",
	"copilot-hook-script",
	"copilot-wrapper",
] as const;

export type DesktopAgentSetupAction =
	(typeof DESKTOP_AGENT_SETUP_ACTIONS)[number];

interface DesktopAgentSetupTarget {
	id: AgentType | "droid";
	setupActions: readonly DesktopAgentSetupAction[];
	managedBinary?: boolean;
}

export const DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS = [
	"cleanup-global-opencode-plugin",
	"notify-script",
] as const satisfies readonly DesktopAgentSetupAction[];

export const DESKTOP_AGENT_SETUP_TARGETS = [
	{
		id: "amp",
		setupActions: ["amp-wrapper"],
		managedBinary: true,
	},
	{
		id: "claude",
		setupActions: ["claude-settings-json", "claude-wrapper"],
		managedBinary: true,
	},
	{
		id: "codex",
		setupActions: ["codex-hooks-json", "codex-wrapper"],
		managedBinary: true,
	},
	{
		id: "droid",
		setupActions: ["droid-wrapper", "droid-settings-json"],
		managedBinary: true,
	},
	{
		id: "opencode",
		setupActions: ["opencode-plugin", "opencode-wrapper"],
		managedBinary: true,
	},
	{
		id: "cursor-agent",
		setupActions: [
			"cursor-hook-script",
			"cursor-agent-wrapper",
			"cursor-hooks-json",
		],
	},
	{
		id: "gemini",
		setupActions: [
			"gemini-hook-script",
			"gemini-wrapper",
			"gemini-settings-json",
		],
		managedBinary: true,
	},
	{
		id: "mastracode",
		setupActions: ["mastra-wrapper", "mastra-hooks-json"],
		managedBinary: true,
	},
	{
		id: "copilot",
		setupActions: ["copilot-hook-script", "copilot-wrapper"],
		managedBinary: true,
	},
] as const satisfies readonly DesktopAgentSetupTarget[];

export const SUPERSET_MANAGED_BINARIES = DESKTOP_AGENT_SETUP_TARGETS.filter(
	(target) => "managedBinary" in target && target.managedBinary,
).map((target) => target.id) satisfies SupersetManagedBinary[];
