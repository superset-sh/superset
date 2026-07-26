import { describe, expect, it } from "bun:test";
import {
	clearAllTerminalSnapshots,
	type EnumerableStorage,
	reclaimOrphanedTerminalSnapshots,
} from "./terminalSnapshotStorage";

function makeStorage(entries: Record<string, string>): EnumerableStorage & {
	keys: () => string[];
} {
	const map = new Map(Object.entries(entries));
	return {
		get length() {
			return map.size;
		},
		key: (index: number) => Array.from(map.keys())[index] ?? null,
		removeItem: (key: string) => {
			map.delete(key);
		},
		keys: () => Array.from(map.keys()),
	};
}

describe("reclaimOrphanedTerminalSnapshots", () => {
	it("removes only snapshots no live terminal can reach", () => {
		const storage = makeStorage({
			"terminal-buffer:live": "scrollback",
			"terminal-dims:live": "{}",
			"terminal-buffer:gone": "scrollback",
			"terminal-dims:gone": "{}",
			"v2-sidebar-projects-org": "{}",
		});

		const removed = reclaimOrphanedTerminalSnapshots(
			storage,
			new Set(["live"]),
		);

		expect(removed).toBe(2);
		expect(storage.keys()).toEqual([
			"terminal-buffer:live",
			"terminal-dims:live",
			"v2-sidebar-projects-org",
		]);
	});

	it("reports zero when every snapshot is still reachable", () => {
		const storage = makeStorage({ "terminal-buffer:live": "scrollback" });

		const removed = reclaimOrphanedTerminalSnapshots(
			storage,
			new Set(["live"]),
		);

		expect(removed).toBe(0);
		expect(storage.keys()).toEqual(["terminal-buffer:live"]);
	});
});

describe("clearAllTerminalSnapshots", () => {
	it("removes reachable snapshots too, since the user asked for the space", () => {
		const storage = makeStorage({
			"terminal-buffer:live": "scrollback",
			"terminal-dims:live": "{}",
			"terminal-buffer:gone": "scrollback",
		});

		const removed = clearAllTerminalSnapshots(storage);

		expect(removed).toBe(3);
		expect(storage.keys()).toEqual([]);
	});

	it("never touches collection data", () => {
		const storage = makeStorage({
			"terminal-buffer:live": "scrollback",
			"v2-workspace-local-state-org": "{}",
			"v2-user-preferences-org": "{}",
			"theme-id": "dark",
		});

		const removed = clearAllTerminalSnapshots(storage);

		expect(removed).toBe(1);
		expect(storage.keys()).toEqual([
			"v2-workspace-local-state-org",
			"v2-user-preferences-org",
			"theme-id",
		]);
	});
});
