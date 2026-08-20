const CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`/g;

const COMMENT = /<!--[\s\S]*?-->/g;

const MEDIA = /<picture\b[\s\S]*?<\/picture>|<img\b[^>]*>|<source\b[^>]*>/gi;

const ANCHOR = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;

const LINE_BREAK = /<br\s*\/?>/gi;
const REMAINING_TAG = /<\/?[a-zA-Z][^>]*>/g;
const EXTRA_BLANK_LINES = /\n{3,}/g;

function stripSegment(segment: string): string {
	return segment
		.replace(COMMENT, "")
		.replace(LINE_BREAK, "\n")
		.replace(MEDIA, "")
		.replace(ANCHOR, "$1")
		.replace(REMAINING_TAG, "");
}

/** Removes HTML GitHub would render and this view would print as prose. */
export function stripHtml(markdown: string): string {
	let out = "";
	let last = 0;
	for (const code of markdown.matchAll(CODE)) {
		const start = code.index ?? 0;
		out += stripSegment(markdown.slice(last, start)) + code[0];
		last = start + code[0].length;
	}
	out += stripSegment(markdown.slice(last));
	return out.replace(EXTRA_BLANK_LINES, "\n\n").trim();
}
