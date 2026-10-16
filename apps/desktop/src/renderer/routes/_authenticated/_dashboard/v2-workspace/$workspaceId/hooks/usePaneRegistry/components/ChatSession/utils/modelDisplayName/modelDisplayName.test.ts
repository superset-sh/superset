import { describe, expect, test } from "bun:test";
import { modelDisplayName } from "./modelDisplayName";

describe("modelDisplayName", () => {
	test("prefers the agent's own label for the id", () => {
		expect(
			modelDisplayName("claude-sonnet-5-5", [
				{
					id: "model",
					label: "Model",
					category: "model",
					currentValue: "claude-sonnet-5-5",
					options: [{ id: "claude-sonnet-5-5", label: "Sonnet 5.5 (latest)" }],
				},
			]),
		).toBe("Sonnet 5.5 (latest)");
	});

	test("reads an unknown id as a name", () => {
		expect(modelDisplayName("claude-sonnet-5-5")).toBe("Sonnet 5.5");
		expect(modelDisplayName("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
		expect(modelDisplayName("claude-opus-5-5")).toBe("Opus 5.5");
		expect(modelDisplayName("gpt-6-sol")).toBe("6 Sol");
	});
});
