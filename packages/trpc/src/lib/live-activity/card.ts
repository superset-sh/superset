import type {
	LiveActivityLabels,
	SelectV2AgentStatus,
} from "@superset/db/schema";
import {
	AGENT_CARD_PRIORITY,
	type AgentCardState,
} from "@superset/shared/agent-status";

/** Four rows with icons fit under the card's 160pt truncation limit. */
export const MAX_CARD_ROWS = 4;

/**
 * Mirrors `AgentActivityAttributes.ContentState` in the widget target. Every
 * field name here is a Swift property; a rename on one side breaks decoding
 * silently, so keep them in lockstep.
 */
export interface CardRow {
	id: string;
	workspaceId: string;
	name: string;
	project: string;
	iconFile: string | null;
	status: string;
	state: AgentCardState;
	/** Epoch milliseconds; the widget ticks the elapsed time itself. */
	since: number;
	isQuiet: boolean;
}

export interface CardContentState {
	rows: CardRow[];
	more: string | null;
	totalCount: number;
	topState: AgentCardState;
	staleDetail: string;
}

type FleetRow = Pick<
	SelectV2AgentStatus,
	| "terminalId"
	| "workspaceId"
	| "workspaceName"
	| "projectId"
	| "projectName"
	| "state"
	| "sinceAt"
>;

export function buildCardContentState({
	fleet,
	labels,
}: {
	fleet: readonly FleetRow[];
	labels: LiveActivityLabels;
}): CardContentState {
	const ranked = [...fleet].sort(
		(a, b) =>
			AGENT_CARD_PRIORITY[b.state] - AGENT_CARD_PRIORITY[a.state] ||
			b.sinceAt.getTime() - a.sinceAt.getTime(),
	);
	const shown = ranked.slice(0, MAX_CARD_ROWS);
	const hidden = ranked.length - shown.length;
	return {
		rows: shown.map((row) => ({
			id: row.terminalId,
			workspaceId: row.workspaceId,
			name: row.workspaceName,
			project: row.projectName ?? "",
			// The phone caches project icons into the App Group under this
			// name while it is open; a project it has never drawn falls back
			// to its initial, which is the common path anyway.
			iconFile: row.projectId ? `${row.projectId}.png` : null,
			status: labels[row.state],
			state: row.state,
			since: row.sinceAt.getTime(),
			isQuiet: false,
		})),
		more: hidden > 0 ? labels.more.replace("{n}", String(hidden)) : null,
		totalCount: ranked.length,
		topState: shown[0]?.state ?? "working",
		staleDetail: "",
	};
}
