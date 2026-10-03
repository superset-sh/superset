export type XmlEnvelope = { tag: string; body: string };

/**
 * Matches a message that is one wrapper tag and nothing else. Anything around
 * the tag means a person wrote it and happened to mention one.
 */
export function xmlEnvelope(text: string): XmlEnvelope | null {
	const match = text.trim().match(/^<([a-zA-Z][\w-]*)>([\s\S]*)<\/\1>$/);
	if (!match) return null;
	return { tag: match[1] ?? "", body: match[2] ?? "" };
}

/** First value of a direct child tag, for readers pulling a field out. */
export function xmlField(body: string, tag: string): string | null {
	const match = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
	return match?.[1]?.trim() ?? null;
}

/** `task-notification` → `task notification`, for a tag with no nicer name. */
export function humanizeTag(tag: string): string {
	return tag.replace(/[-_]/g, " ");
}
