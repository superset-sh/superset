import { useState } from "react";

/**
 * Whether the Projects filter input is open.
 *
 * The header owning this state unmounts whenever the bulk-selection toolbar
 * takes over its row, while the query itself lives on in DashboardSidebar.
 * A plain flag would therefore come back `false` with the list still
 * filtered — an invisible filter. Two rules keep the input visible whenever
 * it matters: the flag initializes from the query on mount, and a non-empty
 * query always forces it open. Escape (which clears the query) and blur with
 * an empty query still collapse it.
 */
export function useProjectFilterExpanded(
	filterQuery: string,
): [isExpanded: boolean, setExpanded: (expanded: boolean) => void] {
	const hasQuery = filterQuery.trim() !== "";
	const [expanded, setExpanded] = useState(hasQuery);
	return [expanded || hasQuery, setExpanded];
}
