/**
 * Generates initials from a name or email.
 *
 * @param name - Full name (e.g., "John Doe")
 * @param email - Email address fallback (optional)
 * @returns Uppercase initials (1-2 characters) or empty string
 *
 * @example
 * getInitials("John Doe") // "JD"
 * getInitials("John") // "J"
 * getInitials(undefined, "john@example.com") // "J"
 * getInitials() // ""
 */
export function getInitials(
	name?: string | null,
	email?: string | null,
): string {
	if (name) {
		const parts = name.trim().split(/\s+/);
		const firstInitial = parts[0]?.[0] ?? "";
		const lastInitial =
			parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
		return `${firstInitial}${lastInitial}`.toUpperCase();
	}

	// Fallback to first character of email
	return email?.[0]?.toUpperCase() ?? "";
}
