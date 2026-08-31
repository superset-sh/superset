import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";

/**
 * Tab order: the arrangement the user dragged first, then every session it
 * doesn't mention appended in creation order. Sessions that ended just drop
 * out — their neighbours keep their relative places either way.
 */
export function orderTerminalRows(
	rows: TerminalRowData[],
	savedOrder: string[] | undefined,
): TerminalRowData[] {
	const rank = new Map<string, number>(
		savedOrder?.map((terminalId, index) => [terminalId, index]),
	);
	return rows.slice().sort((a, b) => {
		const rankA = rank.get(a.terminalId);
		const rankB = rank.get(b.terminalId);
		if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
		if (rankA !== undefined) return -1;
		if (rankB !== undefined) return 1;
		// Ties break on id rather than falling through to whatever order the
		// terminals query happened to return. That order tracks activity, so
		// without this two sessions created in the same millisecond swap places
		// the moment you attach to one — the strip reordering under the thumb
		// that just tapped it.
		return (
			a.createdAt - b.createdAt || a.terminalId.localeCompare(b.terminalId)
		);
	});
}
