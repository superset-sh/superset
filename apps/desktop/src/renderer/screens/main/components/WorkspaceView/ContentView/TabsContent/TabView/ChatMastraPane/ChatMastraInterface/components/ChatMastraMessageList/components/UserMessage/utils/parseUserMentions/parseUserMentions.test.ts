import { describe, expect, it } from "bun:test";
import { parseUserMentions } from "./parseUserMentions";

describe("parseUserMentions", () => {
	it("parses a single file mention", () => {
		expect(parseUserMentions("check @package.json please")).toEqual([
			{ type: "text", value: "check " },
			{
				type: "file-mention",
				raw: "@package.json",
				relativePath: "package.json",
			},
			{ type: "text", value: " please" },
		]);
	});

	it("parses multiple mentions and preserves punctuation", () => {
		expect(parseUserMentions("update @src/index.ts, then @README.md.")).toEqual(
			[
				{ type: "text", value: "update " },
				{
					type: "file-mention",
					raw: "@src/index.ts",
					relativePath: "src/index.ts",
				},
				{ type: "text", value: ", then " },
				{
					type: "file-mention",
					raw: "@README.md",
					relativePath: "README.md",
				},
				{ type: "text", value: "." },
			],
		);
	});

	it("ignores colon-delimited mentions", () => {
		expect(
			parseUserMentions("refer @ticket:SUPER-288 and @src/app.ts"),
		).toEqual([
			{ type: "text", value: "refer @ticket:SUPER-288 and " },
			{
				type: "file-mention",
				raw: "@src/app.ts",
				relativePath: "src/app.ts",
			},
		]);
	});

	it("ignores emails", () => {
		expect(
			parseUserMentions("email test@example.com and check @src/app.ts"),
		).toEqual([
			{ type: "text", value: "email test@example.com and check " },
			{
				type: "file-mention",
				raw: "@src/app.ts",
				relativePath: "src/app.ts",
			},
		]);
	});

	it("returns plain text for non-file mentions", () => {
		expect(parseUserMentions("ping @teammate asap")).toEqual([
			{ type: "text", value: "ping @teammate asap" },
		]);
	});

	it("preserves newlines around mentions", () => {
		expect(parseUserMentions("look at\n@src/app.ts\nnext")).toEqual([
			{ type: "text", value: "look at\n" },
			{
				type: "file-mention",
				raw: "@src/app.ts",
				relativePath: "src/app.ts",
			},
			{ type: "text", value: "\nnext" },
		]);
	});
});
