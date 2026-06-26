import { describe, expect, test } from "bun:test";
import { resolveEffectiveAgent } from "./resolveEffectiveAgent";

// Reproduces #5234: the new workspace modal can drop a typed prompt when the
// user submits before `selectedAgent` is promoted from the placeholder "none"
// to the first configured agent. At submit time we must resolve an effective
// agent so the prompt reliably reaches an agent.
describe("resolveEffectiveAgent", () => {
	test("promotes placeholder 'none' to first configured agent on quick submit", () => {
		// The race: agents are loaded, but the promotion effect hasn't committed
		// yet, so selectedAgent is still the placeholder "none". Without the fix
		// this would stay "none" and the prompt would be dropped to namingPrompt.
		expect(
			resolveEffectiveAgent({
				selectedAgent: "none",
				selectableAgentIds: ["agent-a", "agent-b"],
				userChoseNone: false,
			}),
		).toBe("agent-a");
	});

	test("respects an explicit 'No agent' choice", () => {
		expect(
			resolveEffectiveAgent({
				selectedAgent: "none",
				selectableAgentIds: ["agent-a"],
				userChoseNone: true,
			}),
		).toBe("none");
	});

	test("keeps a real selection untouched", () => {
		expect(
			resolveEffectiveAgent({
				selectedAgent: "agent-b",
				selectableAgentIds: ["agent-a", "agent-b"],
				userChoseNone: false,
			}),
		).toBe("agent-b");
	});

	test("stays 'none' when no agents are configured", () => {
		expect(
			resolveEffectiveAgent({
				selectedAgent: "none",
				selectableAgentIds: [],
				userChoseNone: false,
			}),
		).toBe("none");
	});
});
