import { describe, expect, it } from "bun:test";
import { shouldAutoCloseTerminalPane } from "./shouldAutoCloseTerminalPane";

describe("shouldAutoCloseTerminalPane", () => {
	it("auto-closes after a clean exit once the attached session produced output", () => {
		expect(
			shouldAutoCloseTerminalPane({
				exitCode: 0,
				hasReceivedStreamDataSinceAttach: true,
			}),
		).toBe(true);
	});

	it("does not auto-close when the session exits before any output arrives", () => {
		expect(
			shouldAutoCloseTerminalPane({
				exitCode: 0,
				hasReceivedStreamDataSinceAttach: false,
			}),
		).toBe(false);
	});

	it("does not auto-close killed sessions", () => {
		expect(
			shouldAutoCloseTerminalPane({
				exitCode: 0,
				reason: "killed",
				hasReceivedStreamDataSinceAttach: true,
			}),
		).toBe(false);
	});

	it("does not auto-close non-zero exits", () => {
		expect(
			shouldAutoCloseTerminalPane({
				exitCode: 1,
				hasReceivedStreamDataSinceAttach: true,
			}),
		).toBe(false);
	});
});
