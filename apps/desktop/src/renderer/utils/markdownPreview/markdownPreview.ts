import { toString as mdastToString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const previewProcessor = unified().use(remarkParse).use(remarkGfm);

// Skip the badge/severity strip review bots (coderabbit, greptile, cubic)
// lead with — "Potential issue | Minor | Quick win" makes a useless preview.
function isBotPrefixLine(line: string): boolean {
	return /^(potential issue|nitpick|major|minor|quick win|suggestion)\b/i.test(
		line,
	);
}

/** Single-line plain-text preview of a markdown body. Parses to mdast and
 *  returns the first non-empty top-level child; raw HTML (review-bot badges,
 *  `<details>` blocks) is dropped via `includeHtml: false`. */
export function getMarkdownPreviewText(body: string): string {
	if (!body.trim()) return "No preview available";
	let tree: ReturnType<typeof previewProcessor.parse>;
	try {
		tree = previewProcessor.parse(body);
	} catch {
		return body.split(/\r?\n/).find(Boolean)?.trim() ?? "No preview available";
	}

	const root = tree as { children?: Array<unknown> };
	for (const child of root.children ?? []) {
		const text = mdastToString(child, { includeHtml: false }).trim();
		if (!text || isBotPrefixLine(text)) continue;
		return text.replace(/\s+/g, " ");
	}
	return "No preview available";
}
