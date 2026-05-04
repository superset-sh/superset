import { cn } from "@superset/ui/utils";
import { LuCheck, LuLoaderCircle, LuX } from "react-icons/lu";
import type {
	V2WorkspacePrChecksStatus,
	V2WorkspacePrSummary,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

interface ChecksSummaryProps {
	checks: V2WorkspacePrSummary["checks"];
	status: V2WorkspacePrChecksStatus;
}

export function ChecksSummary({ checks, status }: ChecksSummaryProps) {
	if (status === "none") return null;

	const passing = checks.filter((c) => c.status === "success").length;
	const total = checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	).length;

	const config = {
		success: { Icon: LuCheck, className: "text-emerald-500" },
		failure: { Icon: LuX, className: "text-destructive-foreground" },
		pending: { Icon: LuLoaderCircle, className: "text-amber-500" },
	} as const;

	const { Icon, className } = config[status];
	const label = total > 0 ? `${passing}/${total} checks` : "Checks";

	return (
		<span className={cn("flex items-center gap-1", className)}>
			<Icon className={cn("size-3", status === "pending" && "animate-spin")} />
			<span>{label}</span>
		</span>
	);
}
