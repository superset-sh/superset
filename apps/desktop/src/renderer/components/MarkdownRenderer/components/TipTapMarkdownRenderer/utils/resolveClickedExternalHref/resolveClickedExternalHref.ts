type AnchorLike = {
	tagName?: string;
	getAttribute?: (name: string) => string | null;
	parentNode?: AnchorLike | null;
};

export function resolveClickedExternalHref(
	target: EventTarget | null,
): string | null {
	let current = target as AnchorLike | null;
	while (current) {
		if (
			typeof current.tagName === "string" &&
			current.tagName.toUpperCase() === "A" &&
			typeof current.getAttribute === "function"
		) {
			const href = current.getAttribute("href");
			if (
				typeof href === "string" &&
				(href.startsWith("http://") || href.startsWith("https://"))
			) {
				return href;
			}
			return null;
		}
		current = current.parentNode ?? null;
	}
	return null;
}
