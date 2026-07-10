import { describe, expect, test } from "bun:test";
import { parseBinding } from "./useWorkspaceShortcutModifiers";

describe("parseBinding", () => {
	test("parses a simple binding like 'meta+1'", () => {
		const result = parseBinding("meta+1");
		expect(result.modifierKeys).toEqual(["Meta"]);
		expect(result.triggerKey).toBe("1");
	});

	test("parses a multi-modifier binding like 'ctrl+shift+3'", () => {
		const result = parseBinding("ctrl+shift+3");
		expect(result.modifierKeys).toEqual(["Control", "Shift"]);
		expect(result.triggerKey).toBe("3");
	});

	test("handles unknown modifier gracefully (passes through as-is)", () => {
		const result = parseBinding("hyper+x");
		expect(result.modifierKeys).toEqual(["hyper"]);
		expect(result.triggerKey).toBe("x");
	});
});
