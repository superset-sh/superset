// A page's slug is its public URL path (/p/<slug>). It is minted once at
// creation and frozen for life: retitling a page moves its display name and
// never a link someone already shared.
//
// Every slug carries a random suffix, always — not only on collision. That is
// what removes the collision path entirely: no "is this taken" lookup, no
// retry loop against the unique index. The index stays as a backstop that
// should never fire.
//
// The slug is not a secret and is not a capability. Access to a page is
// enforced per request against its visibility, so there is nothing here to
// rotate and no reason to make it unguessable.

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SUFFIX_LENGTH = 5;
const MAX_BASE_LENGTH = 50;

export function generateBasePageSlug(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, MAX_BASE_LENGTH)
		// Re-trim: slicing mid-word can leave a trailing separator behind.
		.replace(/-$/, "");

	return slug || "page";
}

export function generatePageSlugSuffix(
	randomValues: (length: number) => Uint8Array = defaultRandomValues,
): string {
	const bytes = randomValues(SUFFIX_LENGTH);
	let suffix = "";
	for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
		// Modulo bias across 256 % 36 is negligible for a collision-avoidance
		// suffix — this picks a readable id, it does not carry access.
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
