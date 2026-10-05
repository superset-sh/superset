import { useMemo } from "react";
import type { SessionSnapshot, TurnGroup } from "../../core";
import { deriveTimeline } from "../../core";

export function useTimeline(snapshot: SessionSnapshot): TurnGroup[] {
	const { items, turns } = snapshot;
	return useMemo(() => deriveTimeline({ items, turns }), [items, turns]);
}
