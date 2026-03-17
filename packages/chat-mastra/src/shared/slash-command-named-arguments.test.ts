import { describe, expect, it } from "bun:test";
import {
	normalizeSlashNamedArgumentKey,
	parseNamedSlashArgumentToken,
} from "./slash-command-named-arguments";

describe("normalizeSlashNamedArgumentKey", () => {
	it("normalizes kebab-case to uppercase snake case", () => {
		expect(normalizeSlashNamedArgumentKey("no-api-change")).toBe(
			"NO_API_CHANGE",
		);
	});
});

describe("parseNamedSlashArgumentToken", () => {
	it("parses named argument tokens with optional dash prefixes", () => {
		expect(parseNamedSlashArgumentToken("--goal=ship it")).toEqual({
			keyRaw: "goal",
			keyUpper: "GOAL",
			value: "ship it",
		});
		expect(parseNamedSlashArgumentToken("-constraints=no-api")).toEqual({
			keyRaw: "constraints",
			keyUpper: "CONSTRAINTS",
			value: "no-api",
		});
	});

	it("returns null for non-named tokens", () => {
		expect(parseNamedSlashArgumentToken("src/features")).toBeNull();
	});
});
