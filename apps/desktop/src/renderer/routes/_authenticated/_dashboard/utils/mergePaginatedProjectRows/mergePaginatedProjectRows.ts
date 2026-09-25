export interface PaginatedProjectRows<T> {
	page: number;
	isPending: boolean;
	rows: readonly T[];
}

interface MergePaginatedProjectRowsOptions<T> {
	pages: readonly PaginatedProjectRows<T>[];
	getKey: (row: T) => string;
	getUpdatedAt: (row: T) => string | null;
}

function updatedAtTimestamp(value: string | null): number {
	return Date.parse(value ?? "") || 0;
}

export function mergePaginatedProjectRows<T>({
	pages,
	getKey,
	getUpdatedAt,
}: MergePaginatedProjectRowsOptions<T>): T[] {
	const rowsByPage = new Map<number, T[]>();
	const pendingPages = new Set<number>();
	for (const page of pages) {
		if (page.page > 1 && page.isPending) pendingPages.add(page.page);
		const rows = rowsByPage.get(page.page) ?? [];
		rows.push(...page.rows);
		rowsByPage.set(page.page, rows);
	}

	const seen = new Set<string>();
	const merged: T[] = [];
	for (const [page, rows] of [...rowsByPage.entries()].sort(
		([left], [right]) => left - right,
	)) {
		if (pendingPages.has(page)) continue;
		rows.sort(
			(left, right) =>
				updatedAtTimestamp(getUpdatedAt(right)) -
				updatedAtTimestamp(getUpdatedAt(left)),
		);
		for (const row of rows) {
			const key = getKey(row);
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(row);
		}
	}
	return merged;
}

export function combineQueryResults<T>(results: T[]): T[] {
	return results;
}
