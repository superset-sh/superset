import Fuse from "fuse.js";
import { useCallback, useMemo } from "react";

interface SearchableTask {
	id: string;
	title: string;
	slug: string;
	description: string | null;
	labels: string[] | null;
}

interface SearchResult<T extends SearchableTask> {
	item: T;
	score: number;
	matchType: "exact" | "fuzzy";
}

export function useHybridSearch<T extends SearchableTask>(tasks: T[]) {
	const exactFuse = useMemo(
		() =>
			new Fuse(tasks, {
				keys: [
					{ name: "slug", weight: 2 },
					{ name: "labels", weight: 1 },
				],
				threshold: 0,
				includeScore: true,
				ignoreLocation: true,
				useExtendedSearch: false,
			}),
		[tasks],
	);

	const fuzzyFuse = useMemo(
		() =>
			new Fuse(tasks, {
				keys: [
					{ name: "title", weight: 2 },
					{ name: "description", weight: 1 },
				],
				threshold: 0.3,
				includeScore: true,
				ignoreLocation: true,
				useExtendedSearch: false,
			}),
		[tasks],
	);

	const search = useCallback(
		(query: string): SearchResult<T>[] => {
			if (!query.trim()) {
				return tasks.map((item) => ({
					item,
					score: 1,
					matchType: "exact" as const,
				}));
			}

			const exactMatches = exactFuse.search(query);
			const exactIds = new Set(exactMatches.map((m) => m.item.id));

			const fuzzyMatches = fuzzyFuse
				.search(query)
				.filter((m) => !exactIds.has(m.item.id));

			return [
				...exactMatches.map((m) => ({
					item: m.item,
					score: 1 - (m.score ?? 0),
					matchType: "exact" as const,
				})),
				...fuzzyMatches.map((m) => ({
					item: m.item,
					score: 1 - (m.score ?? 0),
					matchType: "fuzzy" as const,
				})),
			];
		},
		[exactFuse, fuzzyFuse, tasks],
	);

	return { search };
}
