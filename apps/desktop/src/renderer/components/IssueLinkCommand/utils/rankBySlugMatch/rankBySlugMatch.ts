/**
 * How well a task's key answers the typed query, lowest first.
 *
 * Searching "DEMO-1" matches DEMO-1 and every DEMO-1xx sibling. Ordering those
 * by recency buries the exact key under a hundred newer near-misses, which
 * reads as "the issue I asked for isn't there".
 */
export function rankBySlugMatch(slug: string, query: string): number {
	const s = slug.toLowerCase();
	const q = query.trim().toLowerCase();
	if (!q) return 3;
	if (s === q) return 0;
	if (s.startsWith(q)) return 1;
	if (s.includes(q)) return 2;
	return 3;
}
