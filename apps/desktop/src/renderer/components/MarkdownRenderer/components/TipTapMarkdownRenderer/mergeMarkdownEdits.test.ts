import { describe, expect, it } from "bun:test";
import { createMarkdownMerger, mergeMarkdownEdits } from "./mergeMarkdownEdits";

// Each scenario models the real pipeline: `original` is the file on disk,
// `baseline` is what the TipTap round-trip serializes for the unedited doc
// (normalization noise included), `edited` is the serializer output after a
// user edit. The merge must keep untouched regions byte-identical to
// `original` while applying the user's change.

describe("mergeMarkdownEdits", () => {
	it("returns the original verbatim when nothing was edited", () => {
		const original = "Title\n=====\n\n* one\n* two\n";
		const baseline = "# Title\n\n- one\n- two";
		expect(mergeMarkdownEdits(original, baseline, baseline)).toBe(original);
	});

	it("keeps normalized-but-untouched bullets while applying a paragraph edit", () => {
		const original = "Intro text.\n\n* alpha\n* beta\n";
		const baseline = "Intro text.\n\n- alpha\n- beta";
		const edited = "Intro text updated.\n\n- alpha\n- beta";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"Intro text updated.\n\n* alpha\n* beta\n",
		);
	});

	it("preserves hard-wrapped prose the serializer unwrapped", () => {
		const original =
			"A long paragraph\nthat is wrapped\nacross three lines.\n\nSecond paragraph.\n";
		const baseline =
			"A long paragraph that is wrapped across three lines.\n\nSecond paragraph.";
		const edited =
			"A long paragraph that is wrapped across three lines.\n\nSecond paragraph, edited.";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"A long paragraph\nthat is wrapped\nacross three lines.\n\nSecond paragraph, edited.\n",
		);
	});

	it("preserves untouched setext headings", () => {
		const original = "My Title\n========\n\nBody.\n";
		const baseline = "# My Title\n\nBody.";
		const edited = "# My Title\n\nBody, edited.";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"My Title\n========\n\nBody, edited.\n",
		);
	});

	it("preserves front matter the parser mangled", () => {
		const original = "---\ntitle: hello\ndraft: true\n---\n\n# Doc\n\nBody.\n";
		const baseline = "---\n\ntitle: hello draft: true\n\n---\n\n# Doc\n\nBody.";
		const edited = "---\n\ntitle: hello draft: true\n\n---\n\n# Doc\n\nBody!";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"---\ntitle: hello\ndraft: true\n---\n\n# Doc\n\nBody!\n",
		);
	});

	it("preserves raw HTML blocks the parser dropped", () => {
		const original =
			"# Doc\n\n<img src='x.png' width='400'>\n\nText after.\n\n<!-- a comment -->\n";
		const baseline = "# Doc\n\nText after.";
		const edited = "# Doc\n\nText after, edited.";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"# Doc\n\n<img src='x.png' width='400'>\n\nText after, edited.\n\n<!-- a comment -->\n",
		);
	});

	it("preserves escaping-free text when the serializer added escapes elsewhere", () => {
		const original = "Uses snake_case_name here.\n\nOther paragraph.\n";
		const baseline = "Uses snake\\_case\\_name here.\n\nOther paragraph.";
		const edited = "Uses snake\\_case\\_name here.\n\nOther paragraph, edited.";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"Uses snake_case_name here.\n\nOther paragraph, edited.\n",
		);
	});

	it("lets the user's edit win when it overlaps normalization (block takes serializer form)", () => {
		const original = "* alpha\n* beta\n\nTail.\n";
		const baseline = "- alpha\n- beta\n\nTail.";
		const edited = "- alpha edited\n- beta\n\nTail.";
		// The user touched the list, so the whole conflicting hunk takes the
		// serializer's `-` form — but only that hunk, with no lines lost.
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"- alpha edited\n- beta\n\nTail.\n",
		);
	});

	it("does not duplicate or drop lines when the edit sits mid-way through a normalized hunk", () => {
		// Regression: editing the SECOND item of a `*` list (normalized to `-`)
		// must not re-emit the pre-edit line alongside the edited one.
		const original = "* first bullet\n* second bullet\n\nTail.\n";
		const baseline = "- first bullet\n- second bullet\n\nTail.";
		const edited = "- first bullet\n- second bullet (edited)\n\nTail.";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"- first bullet\n- second bullet (edited)\n\nTail.\n",
		);
	});

	it("applies block deletions without disturbing neighbors", () => {
		const original = "* keep\n\nDelete me.\n\nAlso keep\nwrapped.\n";
		const baseline = "- keep\n\nDelete me.\n\nAlso keep wrapped.";
		const edited = "- keep\n\nAlso keep wrapped.";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"* keep\n\nAlso keep\nwrapped.\n",
		);
	});

	it("applies block insertions between preserved blocks", () => {
		const original = "* keep\n\nEnd\n===\n";
		const baseline = "- keep\n\n# End";
		const edited = "- keep\n\nNew paragraph.\n\n# End";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"* keep\n\nNew paragraph.\n\nEnd\n===\n",
		);
	});

	it("round-trips CRLF files and no-ops exactly", () => {
		const original = "# Title\r\n\r\n* item\r\n";
		const baseline = "# Title\n\n- item";
		expect(mergeMarkdownEdits(original, baseline, baseline)).toBe(original);
	});

	it("keeps CRLF line endings when applying an edit", () => {
		const original = "# Title\r\n\r\n* item\r\n\r\nTail.\r\n";
		const baseline = "# Title\n\n- item\n\nTail.";
		const edited = "# Title\n\n- item\n\nTail, edited.";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"# Title\r\n\r\n* item\r\n\r\nTail, edited.\r\n",
		);
	});

	it("preserves a missing trailing newline", () => {
		const original = "# Title\n\nBody.";
		const baseline = "# Title\n\nBody.";
		const edited = "# Title\n\nBody, edited.";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"# Title\n\nBody, edited.",
		);
	});

	it("adds a trailing newline when the original had one", () => {
		const original = "# Title\n\nBody.\n";
		const baseline = "# Title\n\nBody.";
		const edited = "# Title\n\nBody.\n\nMore.";
		expect(mergeMarkdownEdits(original, baseline, edited)).toBe(
			"# Title\n\nBody.\n\nMore.\n",
		);
	});

	it("writes typed content into an empty file with a trailing newline", () => {
		expect(mergeMarkdownEdits("", "", "Hello.")).toBe("Hello.\n");
	});

	it("returns empty when the user deletes everything", () => {
		const original = "# Title\n\n* item\n";
		const baseline = "# Title\n\n- item";
		expect(mergeMarkdownEdits(original, baseline, "")).toBe("");
	});

	it("stays fast and correct on a large document normalized in every block", () => {
		// ~9000 lines where the serializer changed something in every block.
		// The quadratic-LCS implementation took ~20s on this; the suite timeout
		// (5s per test) guards against regressing to that.
		const orig: string[] = [];
		const base: string[] = [];
		for (let i = 0; i < 1000; i += 1) {
			orig.push(`Heading ${i}\n-----------`);
			base.push(`## Heading ${i}`);
			orig.push(`Paragraph ${i} line one\nwrapped with _em_ and snake_${i}.`);
			base.push(`Paragraph ${i} line one wrapped with *em* and snake_${i}.`);
			orig.push(`* bullet a${i}\n* bullet b${i}`);
			base.push(`- bullet a${i}\n- bullet b${i}`);
		}
		const original = `${orig.join("\n\n")}\n`;
		const baseline = base.join("\n\n");
		const merge = createMarkdownMerger(original, baseline);

		expect(merge(baseline)).toBe(original);

		const edited = baseline.replace(
			"Paragraph 500 line one",
			"Paragraph 500 line one EDITED",
		);
		const merged = merge(edited);
		expect(merged).toContain("EDITED");
		expect(merged).toContain("Heading 500\n-----------");
		expect(merged).toContain("* bullet a999");
		expect(merged).toContain("Heading 0\n-----------");
		// Blocks adjacent to the edit must survive intact and unduplicated.
		expect(merged).toContain("* bullet a500");
		expect(merged).toContain("* bullet b500");
		expect(merged.split("Paragraph 500 line one").length - 1).toBe(1);
	});

	it("handles 200k-line documents without engine argument-limit failures", () => {
		// out.push(...lines) passes one argument per line; V8 RangeErrors past
		// the argument limit, which is reachable under the editable-size gate
		// (and lower from deep call stacks). appendRange must copy by index.
		const lines: string[] = [];
		for (let i = 0; i < 200_000; i += 1) lines.push(`line ${i}`);
		const original = `${lines.join("\n")}\n`;
		const baseline = lines.join("\n");
		const merge = createMarkdownMerger(original, baseline);
		expect(merge(baseline)).toBe(original);

		const edited = baseline.replace("line 100000", "line 100000 EDITED");
		const merged = merge(edited);
		expect(merged).toContain("line 100000 EDITED");
		expect(merged.startsWith("line 0\nline 1\n")).toBe(true);
		expect(merged.endsWith("line 199999\n")).toBe(true);
	});

	it("aligns via fuzzy anchors when a leading blank-line mismatch offsets the doc", () => {
		// Regression (found via CDP stress): the first section follows the doc
		// title WITHOUT a blank line, which mis-paired an ordinal blank-line
		// alignment by one segment — an edit then replaced the wrong block
		// (bullets vanished, the edited paragraph duplicated).
		let original = "Big Doc\n=======\n";
		for (let i = 1; i <= 300; i += 1) {
			original += `Section ${i}\n---------\n\nParagraph ${i} line one\nwrapped with _em_ ${i}.\n\n* bullet a${i}\n* bullet b${i}\n\n`;
		}
		const base: string[] = ["# Big Doc"];
		for (let i = 1; i <= 300; i += 1) {
			base.push(`## Section ${i}`);
			base.push(`Paragraph ${i} line one wrapped with *em* ${i}.`);
			base.push(`- bullet a${i}\n- bullet b${i}`);
		}
		const baseline = base.join("\n\n");
		const merge = createMarkdownMerger(original, baseline);
		expect(merge(baseline)).toBe(original);

		const edited = baseline.replace("*em* 200.", "*em* 200. EDIT");
		const merged = merge(edited);
		expect(merged).toContain("EDIT");
		expect(merged).toContain("* bullet a200");
		expect(merged).toContain("* bullet b200");
		expect(merged).toContain("Section 200\n---------");
		expect(merged.split("Paragraph 200 line one").length - 1).toBe(1);
	});
});
