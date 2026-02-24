import { describe, expect, it } from "bun:test";
import { shouldWriteInitialCommand } from "./should-write-initial-command";

describe("shouldWriteInitialCommand", () => {
	it("returns false when attach was recovered", () => {
		expect(
			shouldWriteInitialCommand({
				initialCommandString: "echo setup\n",
				wasRecovered: true,
			}),
		).toBe(false);
	});

	it("returns true when command exists and attach was not recovered", () => {
		expect(
			shouldWriteInitialCommand({
				initialCommandString: "echo setup\n",
				wasRecovered: false,
			}),
		).toBe(true);
	});

	it("returns false when there is no command to write", () => {
		expect(
			shouldWriteInitialCommand({
				initialCommandString: null,
				wasRecovered: false,
			}),
		).toBe(false);
	});
});
