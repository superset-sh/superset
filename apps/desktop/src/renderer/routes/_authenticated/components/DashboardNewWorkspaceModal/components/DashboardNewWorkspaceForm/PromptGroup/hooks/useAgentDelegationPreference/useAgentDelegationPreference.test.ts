import { describe, expect, it } from "bun:test";
import {
	readAgentDelegationPreference,
	writeAgentDelegationPreference,
} from "./useAgentDelegationPreference";

/** Create a minimal in-memory Storage implementation for preference tests. */
function createStorage(initialValue: string | null = null) {
	let value = initialValue;
	return {
		getItem: () => value,
		setItem: (_key: string, nextValue: string) => {
			value = nextValue;
		},
	};
}

describe("agent delegation preference", () => {
	it("defaults missing or unknown values to native delegation", () => {
		expect(readAgentDelegationPreference(null)).toBe("native");
		expect(readAgentDelegationPreference(createStorage("unknown"))).toBe(
			"native",
		);
	});

	it("persists and restores visible pane fan-out", () => {
		const storage = createStorage();

		writeAgentDelegationPreference(storage, "workspaces");

		expect(readAgentDelegationPreference(storage)).toBe("workspaces");
	});
});
