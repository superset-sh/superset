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
		return a.createdAt - b.createdAt;
	});
}
