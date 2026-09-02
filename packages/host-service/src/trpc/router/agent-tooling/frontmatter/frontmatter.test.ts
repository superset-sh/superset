import { describe, expect, it } from "bun:test";
import { parseSlashCommandFrontmatter } from "./frontmatter";

describe("parseSlashCommandFrontmatter", () => {
	it("returns empty metadata when frontmatter is missing", () => {
		expect(parseSlashCommandFrontmatter("# hello")).toEqual({
			description: "",
			argumentHint: "",
			aliases: [],
		});
	});

	it("parses description and argument-hint fields", () => {
		const raw = `---
description: Stage selected files
argument-hint: <glob>
---
Body`;

		expect(parseSlashCommandFrontmatter(raw)).toEqual({
			description: "Stage selected files",
			argumentHint: "<glob>",
			aliases: [],
		});
	});

	it("supports argument_hint alias and quoted values", () => {
		const raw = `---
description: "Run checks: lint + typecheck"
argument_hint: '$PATH'
---
Body`;

		expect(parseSlashCommandFrontmatter(raw)).toEqual({
			description: "Run checks: lint + typecheck",
			argumentHint: "$PATH",
			aliases: [],
		});
	});

	it("parses aliases from comma-separated or bracket values", () => {
		const raw = `---
description: Alias example
aliases: [clear, "cleanup", 'reset']
---
Body`;

		expect(parseSlashCommandFrontmatter(raw)).toEqual({
			description: "Alias example",
			argumentHint: "",
			aliases: ["clear", "cleanup", "reset"],
		});
	});

	it("parses aliases containing commas inside quoted values", () => {
		const raw = `---
description: Alias example
aliases: [clear, "release,stable", 'qa,prod']
---
Body`;

		expect(parseSlashCommandFrontmatter(raw)).toEqual({
			description: "Alias example",
			argumentHint: "",
			aliases: ["clear", "release,stable", "qa,prod"],
		});
	});

	it("returns empty metadata for unclosed frontmatter", () => {
		const raw = `---
description: Missing closing delimiter`;

		expect(parseSlashCommandFrontmatter(raw)).toEqual({
			description: "",
			argumentHint: "",
			aliases: [],
		});
	});

	it("returns a fresh empty object for each parse call", () => {
		const first = parseSlashCommandFrontmatter("No frontmatter");
		first.aliases.push("mutated");
		first.description = "changed";
		first.argumentHint = "changed";

		const second = parseSlashCommandFrontmatter("No frontmatter");
		expect(second).toEqual({
			description: "",
			argumentHint: "",
			aliases: [],
		});
	});
});
