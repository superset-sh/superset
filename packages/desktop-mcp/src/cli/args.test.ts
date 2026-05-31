import { describe, expect, test } from "bun:test";
import {
	getBooleanFlag,
	getStringFlag,
	getStringListFlag,
	parseCliArgs,
} from "./args.js";

describe("parseCliArgs", () => {
	test("parses flags, booleans, repeats, and positionals", () => {
		const args = parseCliArgs([
			"smoke",
			"--url-includes",
			"#/sign-in",
			"--interactive-only",
			"--tag=login",
			"--tag",
			"desktop",
			"extra",
		]);

		expect(args.command).toBe("smoke");
		expect(getStringFlag(args, "url-includes")).toBe("#/sign-in");
		expect(getBooleanFlag(args, "interactive-only")).toBe(true);
		expect(getStringListFlag(args, "tag")).toEqual(["login", "desktop"]);
		expect(args.positionals).toEqual(["extra"]);
	});
});
