interface ComputeSearchUpdateOptions {
	rangeCount: number;
	currentActiveIndex: number;
	preserveActiveMatch: boolean;
}

export interface SearchUpdate {
	matchCount: number;
	activeMatchIndex: number;
	shouldScrollActiveIntoView: boolean;
}

export function computeSearchUpdate({
	rangeCount,
	currentActiveIndex,
	preserveActiveMatch,
}: ComputeSearchUpdateOptions): SearchUpdate {
	if (rangeCount === 0) {
		return {
			matchCount: 0,
			activeMatchIndex: 0,
			shouldScrollActiveIntoView: false,
		};
	}

	if (preserveActiveMatch) {
		const clampedIndex = Math.min(
			Math.max(currentActiveIndex, 0),
			rangeCount - 1,
		);
		return {
			matchCount: rangeCount,
			activeMatchIndex: clampedIndex,
			shouldScrollActiveIntoView: false,
		};
	}

	return {
		matchCount: rangeCount,
		activeMatchIndex: 0,
		shouldScrollActiveIntoView: true,
	};
}
