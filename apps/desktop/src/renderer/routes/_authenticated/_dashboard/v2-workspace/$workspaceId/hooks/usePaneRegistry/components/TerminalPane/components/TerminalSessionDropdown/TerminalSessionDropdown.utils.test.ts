import { describe, expect, it } from "bun:test";
import {
	getTerminalDisplayTitle,
	getTerminalSessionListRefetchInterval,
	shouldQueryTerminalSessionList,
	TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS,
} from "./TerminalSessionDropdown.utils";

describe("TerminalSessionDropdown query policy", () => {
	it("does not query or poll while closed", () => {
		expect(shouldQueryTerminalSessionList(false)).toBe(false);
		expect(getTerminalSessionListRefetchInterval(false)).toBe(false);
	});

	it("queries and polls while open", () => {
		expect(shouldQueryTerminalSessionList(true)).toBe(true);
		expect(getTerminalSessionListRefetchInterval(true)).toBe(
			TERMINAL_SESSION_LIST_REFETCH_INTERVAL_MS,
		);
	});

	it("keeps closed dropdowns cold under tab churn", () => {
		for (let i = 0; i < 10_000; i++) {
			expect(shouldQueryTerminalSessionList(false)).toBe(false);
			expect(getTerminalSessionListRefetchInterval(false)).toBe(false);
		}
	});
});

describe("getTerminalDisplayTitle", () => {
	it("prefers explicit pane title overrides over runtime titles", () => {
		expect(
			getTerminalDisplayTitle({
				titleOverride: "echo sequence",
				runtimeTitle: "Terminal",
				sessionTitle: "zsh",
			}),
		).toBe("echo sequence");
	});

	it("falls back through runtime, session, and default titles", () => {
		expect(getTerminalDisplayTitle({ runtimeTitle: "vim" })).toBe("vim");
		expect(getTerminalDisplayTitle({ sessionTitle: "zsh" })).toBe("zsh");
		expect(getTerminalDisplayTitle({})).toBe("Terminal");
	});
});
