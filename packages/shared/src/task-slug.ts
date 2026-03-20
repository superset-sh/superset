export function generateBaseTaskSlug(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);

	return slug || "task";
}

export function generateUniqueTaskSlug(
	baseSlug: string,
	existingSlugs: Iterable<string>,
): string {
	const usedSlugs = new Set(existingSlugs);

	if (!usedSlugs.has(baseSlug)) {
		return baseSlug;
	}

	let counter = 1;
	let slug = `${baseSlug}-${counter}`;

	while (usedSlugs.has(slug)) {
		counter += 1;
		slug = `${baseSlug}-${counter}`;
	}

	return slug;
}
