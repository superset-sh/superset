const LINEAR_UPLOAD_HOST = "uploads.linear.app";

function normalizeUrl(raw: string): string | null {
	try {
		const url = new URL(raw);
		if (url.host !== LINEAR_UPLOAD_HOST) {
			return null;
		}
		return url.toString();
	} catch {
		return null;
	}
}

export function extractAssetUrls(markdown: string | null | undefined): string[] {
	if (!markdown) return [];

	const matches = markdown.match(/https?:\/\/[^\s)"'>]+/g) ?? [];
	const urls = matches
		.map((match) => normalizeUrl(match))
		.filter((url): url is string => url !== null);

	return [...new Set(urls)];
}

export function replaceAssetUrls(
	markdown: string | null | undefined,
	replacements: ReadonlyMap<string, string>,
): string {
	if (!markdown || replacements.size === 0) {
		return markdown ?? "";
	}

	let output = markdown;
	const replacementEntries = [...replacements.entries()].sort(
		(a, b) => b[0].length - a[0].length,
	);
	for (const [sourceUrl, mirroredUrl] of replacementEntries) {
		if (!output.includes(sourceUrl)) continue;
		output = output.split(sourceUrl).join(mirroredUrl);
	}

	return output;
}
