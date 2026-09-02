import { useLingui } from "@lingui/react/macro";
import { LuCheck, LuLoaderCircle, LuX } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import type { DashboardSidebarWorkspacePullRequestCheck } from "../../../../../../types";

interface ChecksSummaryProps {
	checks: DashboardSidebarWorkspacePullRequestCheck[];
	status: "success" | "failure" | "pending" | "none";
}

export function ChecksSummary({ checks, status }: ChecksSummaryProps) {
	const { t } = useLingui();
	if (status === "none") return null;

	const passing = checks.filter((check) => check.status === "success").length;
	const total = checks.filter(
		(check) => check.status !== "skipped" && check.status !== "cancelled",
	).length;

	const config = {
		success: {
			icon: LuCheck,
			className: "text-emerald-500",
		},
		failure: {
			icon: LuX,
			className: "text-destructive-foreground",
		},
		pending: {
			icon: LuLoaderCircle,
			className: "text-amber-500",
		},
	};

	const { icon: Icon, className } = config[status];
	const label =
		total > 0
			? t({
					id: "dashboard.sidebar.checksSummary.passingCount",
					message: `${passing}/${total} checks`,
				})
			: t({ id: "dashboard.sidebar.checksSummary.checks", message: "Checks" });

	return (
		<span className={`flex items-center gap-1 ${className}`}>
			<Icon
				className={`size-3 ${status === "pending" ? "animate-spin" : ""}`}
				strokeWidth={STROKE_WIDTH}
			/>
			<span>{label}</span>
		</span>
	);
}
