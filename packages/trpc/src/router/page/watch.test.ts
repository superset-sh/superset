import { describe, expect, it } from "bun:test";
import { WATCH_STALE_MS, watchState } from "./watch";

const now = 1_800_000_000_000;
const beat = (msAgo: number) => new Date(now - msAgo);

describe("watchState", () => {
	it("reports a fresh heartbeat as watching, naming the agent", () => {
		expect(
			watchState(
				{ watchedByAgent: "claude", watchHeartbeatAt: beat(10_000) },
				now,
			),
		).toEqual({ watching: true, agentId: "claude" });
	});

	it("stops claiming a watcher once the heartbeat goes stale", () => {
		expect(
			watchState(
				{ watchedByAgent: "claude", watchHeartbeatAt: beat(WATCH_STALE_MS) },
				now,
			),
		).toEqual({ watching: false, agentId: null });
	});

	it("treats a page that was never watched as unwatched", () => {
		expect(
			watchState({ watchedByAgent: null, watchHeartbeatAt: null }, now),
		).toEqual({ watching: false, agentId: null });
	});

	it("still reports watching when the agent has no label", () => {
		expect(
			watchState({ watchedByAgent: null, watchHeartbeatAt: beat(1_000) }, now),
		).toEqual({ watching: true, agentId: null });
	});

	it("does not report watching from a heartbeat in the future going stale", () => {
		expect(
			watchState(
				{ watchedByAgent: "claude", watchHeartbeatAt: new Date(now + 5_000) },
				now,
			),
		).toEqual({ watching: true, agentId: "claude" });
	});
});
