import { toString as mdastToString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const previewProcessor = unified().use(remarkParse).use(remarkGfm);

// Bot review tools (coderabbit, greptile, cubic) lead with a badge/severity
// strip like "Potential issue | Minor | Quick win" — useless as a preview,
// so skip ahead to the real first sentence.
function isBotPrefixLine(line: string): boolean {
	return /^(potential issue|nitpick|major|minor|quick win|suggestion)\b/i.test(
		line,
	);
}

/**
 * Extract a single-line plain-text preview from a markdown body.
 *
 * Parses the body to mdast and walks top-level children, returning the first
 * non-empty, non-bot-prefix line. Raw HTML (`<a><img>` review badges,
 * `<details>` disclosure blocks) is dropped via `includeHtml: false` rather
 * than regex-stripped.
 */
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
