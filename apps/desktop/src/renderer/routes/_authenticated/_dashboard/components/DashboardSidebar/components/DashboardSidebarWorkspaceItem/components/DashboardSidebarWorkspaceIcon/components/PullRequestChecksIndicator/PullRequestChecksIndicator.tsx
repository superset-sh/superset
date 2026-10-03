import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuLoaderCircle, LuX } from "react-icons/lu";
import type { DashboardSidebarWorkspacePullRequest } from "../../../../../../types";

interface PullRequestChecksIndicatorProps {
	className: string;
	state: DashboardSidebarWorkspacePullRequest["state"] | null;
	status: DashboardSidebarWorkspacePullRequest["checksStatus"];
}

export function PullRequestChecksIndicator({
	state,
	status,
	className,
}: PullRequestChecksIndicatorProps) {
	const { t } = useLingui();
	if (!state || state === "merged" || state === "closed") return null;
	if (status !== "pending" && status !== "failure") return null;

	const isPending = status === "pending";
	const label = isPending
		? t({ message: "Checks running" })
		: t({ message: "Checks failed" });
	const Icon = isPending ? LuLoaderCircle : LuX;
	return (
		<span
			role="img"
			aria-label={label}
			title={label}
			className={cn(
				"absolute flex size-2.5 items-center justify-center rounded-full bg-sidebar",
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				strokeWidth={3}
				className={
					isPending
						? "size-2.5 motion-safe:animate-spin text-amber-500"
						: "size-2.5 text-destructive"
				}
			/>
		</span>
	);
}
