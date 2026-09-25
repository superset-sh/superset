import { useMemo } from "react";
import type { SessionSnapshot } from "../../core";
import { derivePendingApprovals } from "../../core";
import type { ApprovalRequest } from "../../protocol/items";

export function useApprovals(snapshot: SessionSnapshot): ApprovalRequest[] {
	return useMemo(() => derivePendingApprovals(snapshot), [snapshot]);
}
