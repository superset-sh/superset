export function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const first = parts[0];
	const last = parts[parts.length - 1];
	if (!first || !last) return "?";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}
