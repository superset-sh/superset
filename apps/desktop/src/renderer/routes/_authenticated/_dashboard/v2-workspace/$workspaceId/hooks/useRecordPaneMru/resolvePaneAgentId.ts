import type { Pane } from "@superset/panes";
import {
	AGENT_IDENTITY_LABELS,
	BUILTIN_AGENT_LABELS,
} from "@superset/shared/agent-catalog";
import type { PaneViewerData, TerminalPaneData } from "../../types";

function normalize(value: string): string {
	return value.toLowerCase().replace(/[\s_-]/g, "");
}

/**
 * Known agent labels and ids, normalized, mapped to the agent id that keys
 * PRESET_ICONS — e.g. "OpenCode" and "opencode" both reach "opencode".
 */
const AGENT_IDS_BY_NAME: ReadonlyMap<string, string> = new Map(
	Object.entries({ ...BUILTIN_AGENT_LABELS, ...AGENT_IDENTITY_LABELS }).flatMap(
		([id, label]) => [
			[normalize(id), id] as const,
			[normalize(label), id] as const,
		],
	),
);

/**
 * The agent whose logo should represent this pane in the Ctrl+Tab switcher,
 * or undefined to fall back to a per-kind glyph.
 *
 * Three sources, in order of reliability:
 *
 * 1. A CHAT pane IS the built-in Superset chat, so it always maps to
 *    "superset". Its pane data carries no agent id because nothing varies.
 * 2. A TERMINAL pane's host-service binding. Authoritative, but it only
 *    exists for agents that report themselves through lifecycle hooks —
 *    Claude does, most others do not.
 * 3. The pane's resolved title. Terminals running an agent title themselves
 *    after it ("Codex", "OpenCode"), which is what the tab bar shows. This is
 *    a heuristic, so it runs last and only when the title matches a known
 *    agent name exactly; an ordinary title like "bun test" matches nothing
 *    and correctly yields no logo.
 */
export function resolvePaneAgentId({
	pane,
	label,
	agentBindings,
}: {
	pane: Pane<PaneViewerData>;
	label: string;
	agentBindings: Map<string, { agentId?: string }>;
}): string | undefined {
	if (pane.kind === "chat") return "superset";
	if (pane.kind !== "terminal") return undefined;

	const { terminalId } = pane.data as TerminalPaneData;
	const boundAgentId = agentBindings.get(terminalId)?.agentId;
	if (boundAgentId) return boundAgentId;

	return AGENT_IDS_BY_NAME.get(normalize(label));
}
