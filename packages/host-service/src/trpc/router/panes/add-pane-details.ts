import { agentRunState } from "@superset/shared/agent-status";
import type { PaneLayoutOpResult } from "@superset/shared/pane-layout-ops";

// Agents put a spinner or status glyph in front of their title ("◑ Fix login");
// the agent's state is reported on its own, so the glyph is noise here.
const LEADING_GLYPHS = /^[^\p{L}\p{N}~/.([{"'`]+/u;

function cleanTitle(title: string | null | undefined): string | null {
	const cleaned = title?.replace(LEADING_GLYPHS, "").trim();
	return cleaned ? cleaned : null;
}

interface TerminalDetails {
	titles: ReadonlyMap<string, string | null>;
	agents: ReadonlyMap<string, { agentId: string; lastEventType: string }>;
}

/** Adds each terminal pane's title and agent state, which only the host knows. */
export function addPaneDetails(
	result: PaneLayoutOpResult,
	{ titles, agents }: TerminalDetails,
): PaneLayoutOpResult {
	return {
		...result,
		layout: {
			...result.layout,
			tabs: result.layout.tabs.map((tab) => ({
				...tab,
				panes: tab.panes.map((pane) => {
					if (!pane.terminalId) return pane;
					const binding = agents.get(pane.terminalId);
					return {
						...pane,
						terminalTitle: cleanTitle(titles.get(pane.terminalId)),
						agent: binding
							? {
									id: binding.agentId,
									state: agentRunState(binding.lastEventType),
								}
							: null,
					};
				}),
			})),
		},
	};
}
