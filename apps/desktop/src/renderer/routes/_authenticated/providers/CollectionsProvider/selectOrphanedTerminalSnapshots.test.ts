import { describe, expect, it } from "bun:test";
import { selectOrphanedTerminalSnapshots } from "./selectOrphanedTerminalSnapshots";

const bufferKey = (terminalId: string) => `terminal-buffer:${terminalId}`;
const dimsKey = (terminalId: string) => `terminal-dims:${terminalId}`;

describe("selectOrphanedTerminalSnapshots", () => {
	it("keeps snapshots for reachable terminals (identity)", () => {
		const keys = [bufferKey("live"), dimsKey("live")];

		const orphaned = selectOrphanedTerminalSnapshots(keys, new Set(["live"]));

		expect(orphaned).toEqual([]);
	});

	it("selects both keys of a terminal nothing can reach", () => {
		const keys = [bufferKey("gone"), dimsKey("gone")];

		const orphaned = selectOrphanedTerminalSnapshots(keys, new Set());

		expect(orphaned).toEqual([bufferKey("gone"), dimsKey("gone")]);
	});

	it("separates reachable from orphaned in a mixed store", () => {
		const keys = [
			bufferKey("live"),
			bufferKey("gone"),
			dimsKey("live"),
			dimsKey("gone"),
		];

		const orphaned = selectOrphanedTerminalSnapshots(keys, new Set(["live"]));

		expect(orphaned).toEqual([bufferKey("gone"), dimsKey("gone")]);
	});

	it("ignores keys owned by other features", () => {
		const keys = [
			"v2-workspace-local-state-org-1",
			"theme-id",
			"terminal-presets",
			bufferKey("gone"),
		];

		const orphaned = selectOrphanedTerminalSnapshots(keys, new Set());

		expect(orphaned).toEqual([bufferKey("gone")]);
	});

	it("keeps a prefix-only key, which persistBuffer could not have written", () => {
		const keys = [bufferKey(""), dimsKey("")];

		const orphaned = selectOrphanedTerminalSnapshots(keys, new Set());

		expect(orphaned).toEqual([]);
	});

	it("treats a parked terminal as reachable so its scrollback survives", () => {
		// Parked terminals have no live runtime but restore from the snapshot,
		// so the registry still reports them as registered.
		const keys = [bufferKey("parked")];

		const orphaned = selectOrphanedTerminalSnapshots(keys, new Set(["parked"]));

		expect(orphaned).toEqual([]);
	});
});
