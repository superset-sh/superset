/**
 * Generates a URL-safe slug from a title with randomness to avoid collisions
 *
 * Example: "My New Feature" -> "my-new-feature-a8f3"
 *
 * @param title - The title to convert to a slug
 * @param maxLength - Maximum length of the slug (default: 50)
 * @param randomLength - Number of random characters to append (default: 4)
 * @returns A URL-safe slug
 */
export function generateSlug(
	title: string,
	maxLength = 50,
	randomLength = 4,
): string {
	// Convert to lowercase and replace spaces/special chars with hyphens
	let slug = title
		.toLowerCase()
		.trim()
		// Replace spaces and underscores with hyphens
		.replace(/[\s_]+/g, "-")
		// Remove all non-alphanumeric characters except hyphens
		.replace(/[^a-z0-9-]/g, "")
		// Replace multiple consecutive hyphens with a single one
		.replace(/-+/g, "-")
		// Remove leading/trailing hyphens
		.replace(/^-+|-+$/g, "");

	// If slug is empty after sanitization, use a default
	if (!slug) {
		slug = "worktree";
	}

	// Generate random suffix using lowercase alphanumeric characters
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let randomSuffix = "";
	for (let i = 0; i < randomLength; i++) {
		randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	// Calculate available length for the base slug
	// Reserve space for: hyphen (1) + random suffix (randomLength)
	const availableLength = maxLength - randomLength - 1;

	// Truncate slug if needed to fit within maxLength
	if (slug.length > availableLength) {
		// Try to truncate at a hyphen boundary for better readability
		const truncated = slug.substring(0, availableLength);
		const lastHyphen = truncated.lastIndexOf("-");

		if (lastHyphen > availableLength * 0.7) {
			// If there's a hyphen in the last 30% of the truncated string, use it
			slug = truncated.substring(0, lastHyphen);
		} else {
			// Otherwise just truncate
			slug = truncated;
		}

		// Remove trailing hyphen if any
		slug = slug.replace(/-+$/, "");
	}

	return `${slug}-${randomSuffix}`;
}

/**
 * Generates a branch name from a title with an optional prefix
 *
 * Example: "My New Feature" with prefix "feat" -> "feat/my-new-feature-a8f3"
 *
 * @param title - The title to convert to a branch name
 * @param prefix - Optional prefix (e.g., "feat", "fix", "chore")
 * @returns A branch name
 */
export function generateBranchName(title: string, prefix?: string): string {
	const slug = generateSlug(title);

	if (prefix) {
		// Remove any trailing slashes from prefix
		const cleanPrefix = prefix.replace(/\/+$/, "");
		return `${cleanPrefix}/${slug}`;
	}

	return slug;
}
