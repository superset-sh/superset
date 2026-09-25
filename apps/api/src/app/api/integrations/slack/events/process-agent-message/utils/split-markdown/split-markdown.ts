/** Slack limits all Markdown blocks in a message to 12,000 characters. */
export function splitMarkdown(text: string): string[] {
	const parts: string[] = [];
	let remaining = text;
	while (remaining.length > 12_000) {
		const newline = remaining.lastIndexOf("\n", 12_000);
		let end = newline > 6_000 ? newline + 1 : 12_000;
		// Avoid splitting UTF-16 surrogate pairs, including emoji.
		if (end > 12_000 || /[\uD800-\uDBFF]/.test(remaining[end - 1] ?? "")) end--;
		parts.push(remaining.slice(0, end));
		remaining = remaining.slice(end);
	}
	if (remaining) parts.push(remaining);
	return parts;
}
