import { requireNativeModule } from "expo";

export interface AgentRow {
	/** Terminal id — selected as `?tab=` on the workspace route. */
	id: string;
	/** Workspace the terminal belongs to; the deep link's real target. */
	workspaceId: string;
	branch: string;
	project: string;
	/** Filename returned by `cacheIcon`, or omitted to draw the initial. */
	iconFile?: string;
	/** Pre-translated status word, e.g. "Needs you". */
	status: string;
	state: "permission" | "working" | "failed" | "review";
	/**
	 * Time in the current state, already formatted — "12m", "1h", "3d".
	 * Formatted here rather than in Swift: SwiftUI's free-ticking timer can
	 * only render mm:ss, and units belong in Lingui's catalogs.
	 */
	elapsed: string;
	isQuiet?: boolean;
}

export interface AgentSnapshot {
	headline: string;
	rows: AgentRow[];
	more?: string;
	topState: AgentRow["state"];
	staleDetail?: string;
	machineName: string;
	staleAfterSeconds?: number;
}

/**
 * Row order for the card, most urgent first.
 *
 * Deliberately NOT desktop's `STATUS_PRIORITY`, which ranks `working` above
 * `review`. On a glanceable card the question is "what wants me?", and a
 * finished session waiting to be read wants you more than a busy one that
 * does not. Rows are sorted by this, then by recency.
 */
export const CARD_PRIORITY: Record<AgentRow["state"], number> = {
	permission: 4,
	failed: 3,
	review: 2,
	working: 1,
};

export function orderRows(rows: AgentRow[]): AgentRow[] {
	return [...rows].sort(
		(a, b) => CARD_PRIORITY[b.state] - CARD_PRIORITY[a.state],
	);
}

interface LiveActivityModule {
	areActivitiesEnabled: () => boolean;
	activeIds: () => string[];
	/** Downloads, downscales and caches a project icon into the App Group. */
	cacheIcon: (key: string, url: string) => Promise<string>;
	start: (snapshot: AgentSnapshot) => Promise<string>;
	update: (
		id: string,
		snapshot: AgentSnapshot,
		alert?: string | null,
	) => Promise<void>;
	endAll: () => Promise<void>;
}

export default requireNativeModule<LiveActivityModule>("LiveActivity");
