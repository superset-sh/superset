import { expect, test } from "bun:test";
import {
	issueAttributionToken,
	verifyAttributionToken,
} from "./attribution-token";

test("attribution tokens authorize only their owning terminal", () => {
	const token = issueAttributionToken("terminal-a");
	expect(verifyAttributionToken("terminal-a", token)).toBe(true);
	expect(verifyAttributionToken("terminal-b", token)).toBe(false);
	for (const invalid of [
		undefined,
		"",
		"a".repeat(64),
		token.slice(1),
		"z".repeat(64),
	]) {
		expect(verifyAttributionToken("terminal-a", invalid)).toBe(false);
	}
});
