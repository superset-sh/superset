import { describe, expect, it } from "bun:test";
import {
	applyDefinitionEdit,
	parseFrontmatter,
	splitFrontmatter,
} from "./frontmatter";

const WORKER = `---
name: worker
# keep sonnet until benchmarks settle
model: sonnet
memory: project
tools:
  - Bash
  - Read
---

You are a worker agent.
`;

describe("splitFrontmatter", () => {
	it("splits fenced frontmatter from body", () => {
		const { frontmatterText, body } = splitFrontmatter(WORKER);
		expect(frontmatterText).toContain("model: sonnet");
		expect(body).toBe("\nYou are a worker agent.\n");
	});

	it("treats files without frontmatter as body-only", () => {
		const { frontmatterText, body } = splitFrontmatter("just text\n");
		expect(frontmatterText).toBeNull();
		expect(body).toBe("just text\n");
	});

	it("treats an unclosed fence as body-only", () => {
		const raw = "---\nname: x\nno closing fence\n";
		expect(splitFrontmatter(raw).frontmatterText).toBeNull();
	});
});

describe("parseFrontmatter", () => {
	it("parses scalar and list values", () => {
		const fm = parseFrontmatter(WORKER);
		expect(fm.model).toBe("sonnet");
		expect(fm.tools).toEqual(["Bash", "Read"]);
	});

	it("returns empty object for invalid yaml", () => {
		expect(parseFrontmatter("---\n[: broken\n---\nbody")).toEqual({});
	});
});

describe("applyDefinitionEdit", () => {
	it("changes one key and leaves everything else byte-identical", () => {
		const next = applyDefinitionEdit({
			raw: WORKER,
			patch: { model: "opus" },
		});
		expect(next).toContain("model: opus");
		expect(next).toContain("# keep sonnet until benchmarks settle");
		expect(next).toContain("memory: project");
		expect(next).toContain("\nYou are a worker agent.\n");
		expect(parseFrontmatter(next).tools).toEqual(["Bash", "Read"]);
	});

	it("preserves key order", () => {
		const next = applyDefinitionEdit({ raw: WORKER, patch: { model: "opus" } });
		expect(next.indexOf("name:")).toBeLessThan(next.indexOf("model:"));
		expect(next.indexOf("model:")).toBeLessThan(next.indexOf("memory:"));
	});

	it("adds a missing key", () => {
		const next = applyDefinitionEdit({ raw: WORKER, patch: { effort: "max" } });
		expect(parseFrontmatter(next).effort).toBe("max");
		expect(parseFrontmatter(next).model).toBe("sonnet");
	});

	it("deletes a key when patched to null", () => {
		const next = applyDefinitionEdit({ raw: WORKER, patch: { model: null } });
		expect(parseFrontmatter(next).model).toBeUndefined();
		expect(parseFrontmatter(next).memory).toBe("project");
	});

	it("replaces only the body when no patch is given", () => {
		const next = applyDefinitionEdit({ raw: WORKER, body: "\nNew body.\n" });
		const { frontmatterText } = splitFrontmatter(WORKER);
		expect(next).toBe(`---\n${frontmatterText}---\n\nNew body.\n`);
	});

	it("creates a frontmatter block on files that lack one", () => {
		const next = applyDefinitionEdit({
			raw: "Only instructions here.\n",
			patch: { model: "opus" },
		});
		expect(parseFrontmatter(next).model).toBe("opus");
		expect(splitFrontmatter(next).body).toBe("Only instructions here.\n");
	});
});
