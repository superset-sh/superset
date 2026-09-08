/**
 * KTD8: the mover's idle rule reads a row's last agent event through this
 * closure rather than off the `MovableSession` it was handed — that row was
 * listed before the switch, and a session that has spoken since would still be
 * judged on a snapshot minutes old. So the wiring has to read the store on
 * every call, not close over a value.
 */

import { describe, expect, it } from "bun:test";
import type { HostDb } from "../db/index.ts";
import type { TerminalAgentStore } from "../terminal-agents/index.ts";
import { createAccountEngineHostDeps } from "./host-deps.ts";

function hostDeps(bindings: Map<string, unknown>) {
	return createAccountEngineHostDeps({
		db: {} as HostDb,
		terminalAgentStore: {
			get: (terminalId: string) => bindings.get(terminalId),
		} as unknown as TerminalAgentStore,
		makeContext: () => {
			throw new Error("no launch in this test");
		},
		isBracketedPasteActive: () => false,
	});
}

describe("lastAgentEvent", () => {
	it("reads the store's current event every call", () => {
		const bindings = new Map<string, unknown>([
			["term-1", { lastEventType: "Start", lastEventAt: 1_000 }],
		]);
		const deps = hostDeps(bindings);

		expect(deps.lastAgentEvent?.("term-1")).toEqual({
			type: "Start",
			at: 1_000,
		});

		// The session spoke after the row the mover is holding was listed.
		bindings.set("term-1", { lastEventType: "Stop", lastEventAt: 9_000 });
		expect(deps.lastAgentEvent?.("term-1")).toEqual({
			type: "Stop",
			at: 9_000,
		});
	});

	it("reports nothing for a terminal the store has no binding for", () => {
		expect(hostDeps(new Map()).lastAgentEvent?.("term-gone")).toBeUndefined();
	});
});
