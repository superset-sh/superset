import { describe, expect, it } from "bun:test";
import { inferImportedAgentId } from "./ImportPresetsPage";

describe("inferImportedAgentId", () => {
	it("matches when name is a builtin agent ID", () => {
		expect(inferImportedAgentId({ name: "claude", commands: ["claude"] })).toBe(
			"claude",
		);
	});

	it("matches a renamed preset by command basename — pre-#3546 yolo", () => {
		expect(
			inferImportedAgentId({
				name: "Yolo Claude",
				commands: ["claude --dangerously-skip-permissions"],
			}),
		).toBe("claude");
	});

	it("matches a renamed preset by command basename — current default", () => {
		expect(
			inferImportedAgentId({
				name: "My Claude",
				commands: ["claude --permission-mode acceptEdits"],
			}),
		).toBe("claude");
	});

	it("matches when the command includes a leading directory path", () => {
		expect(
			inferImportedAgentId({
				name: "Custom",
				commands: ["/Users/me/bin/codex --sandbox workspace-write"],
			}),
		).toBe("codex");
	});

	it("returns undefined when neither name nor command basename match", () => {
		expect(
			inferImportedAgentId({
				name: "My Special Tool",
				commands: ["my-special-tool --flag"],
			}),
		).toBeUndefined();
	});

	it("returns undefined for empty commands", () => {
		expect(
			inferImportedAgentId({ name: "Custom", commands: [] }),
		).toBeUndefined();
	});
});
