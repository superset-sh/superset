import type { AgentType } from "@superset/shared/agent-command";

export type SupersetManagedBinary = AgentType;

interface AgentSetupTarget {
	id: AgentType;
	managedBinary?: boolean;
}

/**
 * Agents Superset integrates with, in setup order. The setup/teardown writers
 * for each id live in agent-setup.ts (AGENT_SETUP_DEFINITIONS) — this file
 * stays free of fs-touching imports so shared consumers (e.g. shell-wrappers)
 * can read the target list without pulling in the writers.
 */
export const AGENT_SETUP_TARGETS = [
	{ id: "amp", managedBinary: true },
	{ id: "claude", managedBinary: true },
	{ id: "codex", managedBinary: true },
	{ id: "droid", managedBinary: true },
	{ id: "opencode", managedBinary: true },
	{ id: "omp" },
	{ id: "pi" },
	{ id: "cursor-agent" },
	{ id: "gemini", managedBinary: true },
	{ id: "mastracode", managedBinary: true },
	{ id: "kimi", managedBinary: true },
	{ id: "grok", managedBinary: true },
	{ id: "copilot", managedBinary: true },
	{ id: "vibe", managedBinary: true },
] as const satisfies readonly AgentSetupTarget[];

export type AgentSetupTargetId = (typeof AGENT_SETUP_TARGETS)[number]["id"];

export const SUPERSET_MANAGED_BINARIES = AGENT_SETUP_TARGETS.filter(
	(target) => "managedBinary" in target && target.managedBinary,
).map((target) => target.id) satisfies SupersetManagedBinary[];
