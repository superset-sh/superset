/**
 * Ticket keys look like "SUPER-172" / "ABC-12"; workspace branches created
 * from a task usually embed the key ("adelin/super-172-fix-cards").
 */
export function extractTicketKeyFromBranch(branch: string): string | null {
	// Team prefixes are at least two letters ("ENG", "SUPER") — requiring that
	// keeps version-ish segments like "v2-1" from matching.
	const match = branch.match(/\b([a-z]{2,}-\d+)\b/i);
	return match?.[1]?.toUpperCase() ?? null;
}
