export interface SavedHistoryPage {
	candidates: Array<{
		nativeSessionId: string;
		lastModifiedAt: number;
		bytes: number;
		revision: string;
		conversationId: string | null;
	}>;
	conversations: Array<{
		id: string;
		nativeSessionId: string;
		revision: string;
		state: string;
		terminalId: string | null;
		canFocusExisting: boolean;
	}>;
	nextCursor: string | null;
}

export interface SavedHistoryRow {
	id: string;
	nativeSessionId: string;
	lastModifiedAt?: number;
	conversationId: string | null;
	revision: string;
	canFocusExisting: boolean;
}

/** Account/host pages must already share one query key. Native IDs never group by cwd. */
export function historyRows(pages: SavedHistoryPage[]): SavedHistoryRow[] {
	const saved = new Map(
		pages
			.flatMap((page) => page.conversations)
			.map((row) => [row.nativeSessionId, row]),
	);
	const rows = new Map<string, SavedHistoryRow>();
	for (const candidate of pages.flatMap((page) => page.candidates)) {
		const adopted = saved.get(candidate.nativeSessionId);
		rows.set(candidate.nativeSessionId, {
			id: candidate.nativeSessionId,
			nativeSessionId: candidate.nativeSessionId,
			lastModifiedAt: candidate.lastModifiedAt,
			conversationId: adopted?.id ?? null,
			revision: adopted?.revision ?? candidate.revision,
			canFocusExisting: adopted?.canFocusExisting ?? false,
		});
	}
	for (const adopted of saved.values()) {
		if (rows.has(adopted.nativeSessionId)) continue;
		rows.set(adopted.nativeSessionId, {
			id: adopted.nativeSessionId,
			nativeSessionId: adopted.nativeSessionId,
			conversationId: adopted.id,
			revision: adopted.revision,
			canFocusExisting: adopted.canFocusExisting,
		});
	}
	return [...rows.values()];
}
