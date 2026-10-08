import { expect, test } from "bun:test";
import { withSavedMode } from "./savedChatMode";

test("keeps one mode per agent, newest last, and at most 32 agents", () => {
	expect(withSavedMode({ claude: "default" }, "claude", "auto")).toEqual({
		claude: "auto",
	});
	const full = Object.fromEntries(
		Array.from({ length: 32 }, (_, index) => [`agent${index}`, "default"]),
	);
	const next = withSavedMode(full, "codex", "read-only");
	expect(Object.keys(next)).toHaveLength(32);
	expect(next.agent0).toBeUndefined();
	expect(next.codex).toBe("read-only");
});
