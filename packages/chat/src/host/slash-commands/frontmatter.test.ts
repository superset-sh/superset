import { describe, expect, it } from "bun:test";
import { parseSlashCommandFrontmatter } from "./frontmatter";

describe("parseSlashCommandFrontmatter", () => {
	it("returns empty metadata when frontmatter is missing", () => {
		expect(parseSlashCommandFrontmatter("# hello")).toEqual({
			description: "",
			argumentHint: "",
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
		});
	});

	it("returns empty metadata for unclosed frontmatter", () => {
		const raw = `---
description: Missing closing delimiter`;

		expect(parseSlashCommandFrontmatter(raw)).toEqual({
			description: "",
			argumentHint: "",
		});
	});
});
