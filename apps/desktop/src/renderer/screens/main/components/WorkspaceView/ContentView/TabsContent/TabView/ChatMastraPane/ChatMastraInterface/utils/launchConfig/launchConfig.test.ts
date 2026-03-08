import { describe, expect, it } from "bun:test";
import { getPrefillInput, shouldAutoSend } from "./launchConfig";

// Regression tests for issue #2144:
// Workspace description should NOT be auto-sent to the agent.
// Instead it should be pre-filled in the chat input so the user decides when to send.

describe("getPrefillInput", () => {
	it("returns empty string when launchConfig is null", () => {
		expect(getPrefillInput(null)).toBe("");
	});

	it("returns empty string when launchConfig is undefined", () => {
		expect(getPrefillInput(undefined)).toBe("");
	});

	it("returns empty string when initialPrompt is not set", () => {
		expect(getPrefillInput({})).toBe("");
	});

	it("returns empty string when initialPrompt is empty string", () => {
		expect(getPrefillInput({ initialPrompt: "" })).toBe("");
	});

	it("returns empty string when initialPrompt is whitespace-only", () => {
		expect(getPrefillInput({ initialPrompt: "   " })).toBe("");
	});

	it("returns empty string when autoSend is true (prompt is sent, not pre-filled)", () => {
		expect(
			getPrefillInput({ initialPrompt: "implement feature X", autoSend: true }),
		).toBe("");
	});

	it("returns trimmed initialPrompt when autoSend is not set (pre-fill behavior)", () => {
		expect(getPrefillInput({ initialPrompt: "implement feature X" })).toBe(
			"implement feature X",
		);
	});

	it("returns trimmed initialPrompt when autoSend is false (pre-fill behavior)", () => {
		expect(
			getPrefillInput({
				initialPrompt: "implement feature X",
				autoSend: false,
			}),
		).toBe("implement feature X");
	});

	it("trims whitespace from initialPrompt", () => {
		expect(getPrefillInput({ initialPrompt: "  implement feature X  " })).toBe(
			"implement feature X",
		);
	});
});

describe("shouldAutoSend", () => {
	it("returns false when launchConfig is null", () => {
		expect(shouldAutoSend(null)).toBe(false);
	});

	it("returns false when launchConfig is undefined", () => {
		expect(shouldAutoSend(undefined)).toBe(false);
	});

	it("returns false when autoSend is not set", () => {
		expect(shouldAutoSend({ initialPrompt: "implement feature X" })).toBe(
			false,
		);
	});

	it("returns false when autoSend is false", () => {
		expect(
			shouldAutoSend({ initialPrompt: "implement feature X", autoSend: false }),
		).toBe(false);
	});

	it("returns false when autoSend is true but initialPrompt is empty", () => {
		expect(shouldAutoSend({ autoSend: true })).toBe(false);
	});

	it("returns false when autoSend is true but initialPrompt is whitespace-only", () => {
		expect(shouldAutoSend({ autoSend: true, initialPrompt: "   " })).toBe(
			false,
		);
	});

	it("returns true when autoSend is true and initialPrompt is set (autonomous session)", () => {
		expect(
			shouldAutoSend({ initialPrompt: "implement feature X", autoSend: true }),
		).toBe(true);
	});
});
