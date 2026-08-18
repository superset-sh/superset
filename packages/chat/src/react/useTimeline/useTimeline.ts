import { useMemo } from "react";
import type { SessionSnapshot, TurnGroup } from "../../core";
import { deriveTimeline } from "../../core";

export function useTimeline(snapshot: SessionSnapshot): TurnGroup[] {
	return useMemo(() => deriveTimeline(snapshot), [snapshot]);
}
