import { describe, expect, it } from "bun:test";
import { parseUserMentions } from "./parseUserMentions";

describe("parseUserMentions", () => {
	it("returns empty text segment for empty string", () => {
		expect(parseUserMentions("")).toEqual([{ type: "text", value: "" }]);
	});

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

	it("ignores colon-delimited mentions that are not task mentions", () => {
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

	describe("task mentions", () => {
		it("parses a single task mention", () => {
			expect(parseUserMentions("@task:SUPER-123 fix this bug")).toEqual([
				{
					type: "task-mention",
					raw: "@task:SUPER-123",
					slug: "SUPER-123",
				},
				{ type: "text", value: " fix this bug" },
			]);
		});

		it("parses a task mention in the middle of text", () => {
			expect(
				parseUserMentions("please check @task:PROJ-42 and update"),
			).toEqual([
				{ type: "text", value: "please check " },
				{
					type: "task-mention",
					raw: "@task:PROJ-42",
					slug: "PROJ-42",
				},
				{ type: "text", value: " and update" },
			]);
		});

		it("parses multiple task mentions", () => {
			expect(parseUserMentions("@task:SUPER-1 and @task:SUPER-2")).toEqual([
				{
					type: "task-mention",
					raw: "@task:SUPER-1",
					slug: "SUPER-1",
				},
				{ type: "text", value: " and " },
				{
					type: "task-mention",
					raw: "@task:SUPER-2",
					slug: "SUPER-2",
				},
			]);
		});

		it("parses task mentions alongside file mentions", () => {
			expect(
				parseUserMentions("@task:BUG-99 see @src/index.ts for details"),
			).toEqual([
				{
					type: "task-mention",
					raw: "@task:BUG-99",
					slug: "BUG-99",
				},
				{ type: "text", value: " see " },
				{
					type: "file-mention",
					raw: "@src/index.ts",
					relativePath: "src/index.ts",
				},
				{ type: "text", value: " for details" },
			]);
		});

		it("strips trailing punctuation from task mentions", () => {
			expect(parseUserMentions("check @task:SUPER-123, please")).toEqual([
				{ type: "text", value: "check " },
				{
					type: "task-mention",
					raw: "@task:SUPER-123",
					slug: "SUPER-123",
				},
				{ type: "text", value: ", please" },
			]);
		});

		it("handles task slug containing colon", () => {
			expect(parseUserMentions("see @task:SUPER-123:foo for details")).toEqual([
				{ type: "text", value: "see " },
				{
					type: "task-mention",
					raw: "@task:SUPER-123:foo",
					slug: "SUPER-123:foo",
				},
				{ type: "text", value: " for details" },
			]);
		});

		it("ignores bare @task: with no slug", () => {
			expect(parseUserMentions("just @task: nothing")).toEqual([
				{ type: "text", value: "just @task: nothing" },
			]);
		});

		it("strips trailing quotes from mentions inside quoted strings", () => {
			expect(parseUserMentions('see "@task:SUPER-123" for details')).toEqual([
				{ type: "text", value: 'see "' },
				{
					type: "task-mention",
					raw: "@task:SUPER-123",
					slug: "SUPER-123",
				},
				{ type: "text", value: '" for details' },
			]);
		});

		it("parses task mention at end of text", () => {
			expect(parseUserMentions("working on @task:FEAT-55")).toEqual([
				{ type: "text", value: "working on " },
				{
					type: "task-mention",
					raw: "@task:FEAT-55",
					slug: "FEAT-55",
				},
			]);
		});
	});
});
