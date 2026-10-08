const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

/** What a page says, without its markup: enough for a model to answer from. */
export function htmlToText(html: string): string {
	return html
		.replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(
			/<\/(p|div|section|article|li|tr|h[1-6]|header|footer)>|<br\s*\/?>/gi,
			"\n",
		)
		.replace(/<[^>]+>/g, " ")
		.replace(/&#(\d+);/g, (_match, code: string) =>
			String.fromCodePoint(Number(code)),
		)
		.replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name] ?? match)
		.replace(/[ \t]+/g, " ")
		.replace(/ ?\n ?/g, "\n")
		.replace(/\n{2,}/g, "\n")
		.trim();
}
