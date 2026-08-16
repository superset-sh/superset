import { describe, expect, it } from "bun:test";
import { getAgentSelectionBlocker } from "./getAgentSelectionBlocker";

describe("getAgentSelectionBlocker", () => {
	it("blocks submission while agents are loading", () => {
		expect(
			getAgentSelectionBlocker({
				isFetched: false,
				selectableAgentIds: [],
				selectedAgent: "none",
			}),
		).toBe("Loading agents");
	});

	it("blocks submission when no selectable agents are available", () => {
		expect(
			getAgentSelectionBlocker({
				isFetched: true,
				selectableAgentIds: [],
				selectedAgent: "none",
			}),
		).toBe("No agents available");
	});

	it("allows submission only for a selectable agent", () => {
		expect(
			getAgentSelectionBlocker({
				isFetched: true,
				selectableAgentIds: ["claude"],
				selectedAgent: "none",
			}),
		).toBe("Select an agent");
		expect(
			getAgentSelectionBlocker({
				isFetched: true,
				selectableAgentIds: ["claude"],
				selectedAgent: "claude",
			}),
		).toBeNull();
	});
});
