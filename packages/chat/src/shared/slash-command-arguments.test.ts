import { describe, expect, it } from "bun:test";
import { tokenizeSlashCommandArguments } from "./slash-command-arguments";

describe("tokenizeSlashCommandArguments", () => {
	it("keeps quoted named values with spaces as one token", () => {
		expect(
			tokenizeSlashCommandArguments('src/features goal="improve readability"'),
		).toEqual(["src/features", "goal=improve readability"]);
	});

	it("supports quotes that start mid-token", () => {
		expect(
			tokenizeSlashCommandArguments('constraints="no api changes"'),
		).toEqual(["constraints=no api changes"]);
	});

	it("keeps escaped delimiters within quoted values", () => {
		expect(
			tokenizeSlashCommandArguments('goal="say \\"hello\\"" constraints=no-op'),
		).toEqual(['goal=say "hello"', "constraints=no-op"]);
	});

	it("preserves backslashes in unquoted tokens", () => {
		expect(tokenizeSlashCommandArguments(String.raw`C:\Users\me`)).toEqual([
			String.raw`C:\Users\me`,
		]);
	});

	it("preserves backslashes in unquoted named argument values", () => {
		expect(
			tokenizeSlashCommandArguments(String.raw`path=C:\Users\me\repo`),
		).toEqual([String.raw`path=C:\Users\me\repo`]);
	});
});
