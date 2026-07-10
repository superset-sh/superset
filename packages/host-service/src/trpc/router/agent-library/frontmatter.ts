import { Document, isMap, parseDocument } from "yaml";

/**
 * Frontmatter round-trip for definition files. Editing `model:` must leave
 * every other key, key order, and comments byte-stable, so patches go through
 * yaml's Document API instead of parse -> mutate -> stringify of a plain
 * object. When a save changes only the body, the frontmatter block is reused
 * verbatim (not reserialized).
 */

export interface SplitFile {
	/** Raw YAML between the `---` fences, or null when the file has none. */
	frontmatterText: string | null;
	/** Everything after the closing fence line (or the whole file). */
	body: string;
}

const OPEN_FENCE = /^---[ \t]*\r?\n/;

export function splitFrontmatter(raw: string): SplitFile {
	const open = raw.match(OPEN_FENCE);
	if (!open) return { frontmatterText: null, body: raw };

	const rest = raw.slice(open[0].length);
	const close = rest.match(/(^|\r?\n)---[ \t]*(\r?\n|$)/);
	if (!close || close.index === undefined) {
		return { frontmatterText: null, body: raw };
	}

	const frontmatterText = rest.slice(0, close.index + (close[1]?.length ?? 0));
	const body = rest.slice(close.index + close[0].length);
	return { frontmatterText, body };
}

export function parseFrontmatter(raw: string): Record<string, unknown> {
	const { frontmatterText } = splitFrontmatter(raw);
	if (frontmatterText === null) return {};
	try {
		const doc = parseDocument(frontmatterText);
		const value = doc.toJS() as unknown;
		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			return value as Record<string, unknown>;
		}
		return {};
	} catch {
		return {};
	}
}

export function frontmatterString(
	frontmatter: Record<string, unknown>,
	key: string,
): string | null {
	const value = frontmatter[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Apply a frontmatter patch (null value = delete key) and/or replace the
 * body. Returns the new raw file content.
 */
export function applyDefinitionEdit({
	raw,
	patch,
	body,
}: {
	raw: string;
	patch?: Record<string, string | null>;
	body?: string;
}): string {
	const split = splitFrontmatter(raw);
	const nextBody = body ?? split.body;
	const patchEntries = Object.entries(patch ?? {});

	if (patchEntries.length === 0) {
		if (split.frontmatterText === null) return nextBody;
		const fenced = split.frontmatterText.endsWith("\n")
			? split.frontmatterText
			: `${split.frontmatterText}\n`;
		return `---\n${fenced}---\n${nextBody}`;
	}

	const doc =
		split.frontmatterText === null
			? new Document({})
			: parseDocument(split.frontmatterText);

	if (!isMap(doc.contents)) {
		// Empty or scalar frontmatter — start from a fresh map, preserving nothing.
		doc.contents = doc.createNode({}) as typeof doc.contents;
	}

	for (const [key, value] of patchEntries) {
		if (value === null) {
			doc.delete(key);
		} else {
			doc.set(key, value);
		}
	}

	const yamlText = doc.toString();
	return `---\n${yamlText}---\n${nextBody}`;
}
