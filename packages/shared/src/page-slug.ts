const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SUFFIX_LENGTH = 6;
const MAX_BASE_LENGTH = 50;

export function generateBasePageSlug(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, MAX_BASE_LENGTH)
		.replace(/-$/, "");

	return slug || "page";
}

export function generatePageSlugSuffix(
	randomValues: (length: number) => Uint8Array = defaultRandomValues,
): string {
	const bytes = randomValues(SUFFIX_LENGTH);
	let suffix = "";
	for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
		suffix += SUFFIX_ALPHABET[(bytes[i] ?? 0) % SUFFIX_ALPHABET.length];
	}
	return suffix;
}

export function mintPageSlug(
	title: string,
	randomValues: (length: number) => Uint8Array = defaultRandomValues,
): string {
	return `${generateBasePageSlug(title)}-${generatePageSlugSuffix(randomValues)}`;
}

function defaultRandomValues(length: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(length));
}
