/** Only http(s) links are clickable; stored values can come from imports and syncs. */
export function safeHref(value: string | null | undefined): string | null {
	if (!value) return null;
	return /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}
