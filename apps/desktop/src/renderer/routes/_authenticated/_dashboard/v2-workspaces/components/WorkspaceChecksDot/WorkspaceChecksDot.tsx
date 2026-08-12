import { LuCircleCheck, LuCircleDashed, LuCircleX } from "react-icons/lu";
import type { V2WorkspacePrSummary } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

interface WorkspaceChecksDotProps {
	status: V2WorkspacePrSummary["checksStatus"];
}

/** Tiny PR-checks indicator shared by the list row and board card pills. */
export function WorkspaceChecksDot({ status }: WorkspaceChecksDotProps) {
	if (status === "none") return null;
	if (status === "pending") {
		return <LuCircleDashed className="size-3 text-amber-500" />;
	}
	if (status === "success") {
		return <LuCircleCheck className="size-3 text-emerald-500" />;
	}
	return <LuCircleX className="size-3 text-red-500" />;
}
