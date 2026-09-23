"use client";

import { useEffect, useState } from "react";
import type { PageVisibility } from "../../../../types";

export function usePendingVisibility(
	pageId: string,
	serverVisibility: PageVisibility,
	onSetVisibility: (visibility: PageVisibility) => Promise<void>,
) {
	const [pending, setPending] = useState<{
		pageId: string;
		value: PageVisibility;
	} | null>(null);

	const pendingValue = pending?.pageId === pageId ? pending.value : null;

	useEffect(() => {
		if (pendingValue !== null && serverVisibility === pendingValue) {
			setPending(null);
		}
	}, [serverVisibility, pendingValue]);

	return {
		visibility: pendingValue ?? serverVisibility,
		setVisibility: async (next: PageVisibility) => {
			setPending({ pageId, value: next });
			try {
				await onSetVisibility(next);
			} catch (error) {
				setPending(null);
				throw error;
			}
		},
	};
}
