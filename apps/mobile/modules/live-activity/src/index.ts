import { requireNativeModule } from "expo";

export interface AgentRow {
	/** Terminal id — selected as `?tab=` on the workspace route. */
	id: string;
	/** Workspace the terminal belongs to; the deep link's real target. */
	workspaceId: string;
	name: string;
	project: string;
	/** Filename returned by `cacheIcon`, or omitted to draw the initial. */
	iconFile?: string;
	/** Pre-translated status word, e.g. "Needs you". */
	status: string;
	state: "permission" | "working" | "failed" | "review";
	/** When the row entered its state, epoch ms; the widget ticks from it. */
	since: number;
	isQuiet?: boolean;
}

export interface AgentSnapshot {
	rows: AgentRow[];
	more?: string;
	/** Every agent, not just the rows that fit on the card. */
	totalCount: number;
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

type LiveActivityEvents = {
	/** A running activity's APNs token; only fires when the token changes. */
	onPushToken: (event: { activityId: string; token: string }) => void;
	/** The app-wide token a server uses to start the card from nothing. */
	onPushToStartToken: (event: { token: string }) => void;
	onActivityEnded: (event: { activityId: string; token?: string }) => void;
};

// expo-modules-core 56.0.23 exports a broken `NativeModule` type alias (the
// constructor type, generic dropped), so the emitter surface is typed by hand.
interface LiveActivityModule {
	areActivitiesEnabled: () => boolean;
	activeIds: () => string[];
	/** Downloads, downscales and caches a project icon into the App Group. */
	cacheIcon: (key: string, url: string) => Promise<string>;
	start: (snapshot: AgentSnapshot) => Promise<string>;
	update: (id: string, snapshot: AgentSnapshot) => Promise<void>;
	endAll: () => Promise<void>;
	/** Last tokens seen, for a listener that mounts after they were issued. */
	pushToStartToken: () => string | null;
	activityTokens: () => Record<string, string>;
	addListener<Name extends keyof LiveActivityEvents>(
		eventName: Name,
		listener: LiveActivityEvents[Name],
	): { remove(): void };
}

export default requireNativeModule<LiveActivityModule>("LiveActivity");
