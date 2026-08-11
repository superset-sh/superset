import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import type { PaneMruEntry } from "renderer/stores/pane-mru";

function normalize(value: string): string {
	return value.toLowerCase().replace(/[\s_-]/g, "");
}

const KIND_FALLBACKS: Record<string, string> = {
	terminal: "Terminal",
	chat: "Chat",
	browser: "Browser",
	diff: "Changes",
	file: "File",
};

/**
 * Names that just restate the agent already shown as the row's logo — the
 * agent id and its display label, e.g. "claude" and "Claude".
 */
function agentNames(agentId: string | undefined): Set<string> {
	if (!agentId) return new Set();
	const label =
		AGENT_IDENTITY_LABELS[agentId as keyof typeof AGENT_IDENTITY_LABELS];
	const names = new Set([normalize(agentId)]);
	if (label) names.add(normalize(label));
	return names;
}

/**
 * Split an MRU entry into the two strings the overlay renders.
 *
 * Both the tab and the pane are commonly named after the agent running in
 * them, which in practice produced rows like `Claude › Claude` — and once the
 * row carries the agent's logo, the name is pure repetition. So any segment
 * that merely restates the agent is dropped, as is a tab label that repeats
 * the pane label. What survives is whatever actually distinguishes this pane;
 * when nothing does, the pane kind stands in rather than an empty row.
 *
 * The workspace (and its project, when known) always shows as secondary text
 * — with several agent panes open, that is usually the only thing telling
 * them apart.
 */
export function describeEntry(entry: PaneMruEntry): {
	primary: string;
	secondary: string;
} {
	const redundant = agentNames(entry.agentId);
	const segments: string[] = [];

	for (const raw of [entry.tabLabel, entry.label]) {
		const value = raw?.trim();
		if (!value) continue;
		const key = normalize(value);
		if (redundant.has(key)) continue;
		if (segments.some((existing) => normalize(existing) === key)) continue;
		segments.push(value);
	}

	const primary =
		segments.join(" › ") || KIND_FALLBACKS[entry.kind] || entry.kind;

	const projectName = entry.projectName?.trim();
	const secondary = projectName
		? `${projectName} / ${entry.workspaceName}`
		: entry.workspaceName;

	return { primary, secondary };
}
