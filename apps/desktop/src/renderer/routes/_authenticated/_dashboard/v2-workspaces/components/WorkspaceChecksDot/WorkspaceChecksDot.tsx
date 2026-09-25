import { useLingui } from "@lingui/react/macro";
import type { CheckItem } from "@superset/local-db";
import { LuCircleCheck, LuCircleX } from "react-icons/lu";
import type { V2WorkspacePrSummary } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

interface WorkspaceChecksDotProps {
	status: V2WorkspacePrSummary["checksStatus"];
	checks: CheckItem[];
}

const RADIUS = 4.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Tiny PR-checks indicator shared by the list row and board card pills.
 * Terminal states keep instant-read icons; while checks are running it
 * renders a Linear-style partial ring filled to completed/total.
 */
export function WorkspaceChecksDot({
	status,
	checks,
}: WorkspaceChecksDotProps) {
	const { t } = useLingui();
	if (status === "none") return null;
	if (status === "success") {
		return (
			<LuCircleCheck
				role="img"
				aria-label={t({
					message: "Checks passed",
				})}
				className="size-3 text-emerald-500"
			/>
		);
	}
	if (status === "failure") {
		return (
			<LuCircleX
				role="img"
				aria-label={t({
					message: "Checks failed",
				})}
				className="size-3 text-red-500"
			/>
		);
	}

	// Skipped/cancelled aren't outcomes the ring should count either way.
	const relevant = checks.filter(
		(check) => check.status !== "skipped" && check.status !== "cancelled",
	);
	const completed = relevant.filter(
		(check) => check.status !== "pending",
	).length;
	const fraction =
		relevant.length > 0 ? Math.max(completed / relevant.length, 0.06) : 0.06;

	return (
		<span
			className="flex size-3 items-center justify-center"
			title={t({
				message: `${completed} of ${relevant.length} checks complete`,
			})}
		>
			<svg
				viewBox="0 0 12 12"
				className="size-3 -rotate-90"
				role="img"
				aria-label={t({
					message: `${completed} of ${relevant.length} checks complete`,
				})}
			>
				<circle
					cx="6"
					cy="6"
					r={RADIUS}
					fill="none"
					strokeWidth="1.5"
					className="stroke-amber-500/25"
				/>
				<circle
					cx="6"
					cy="6"
					r={RADIUS}
					fill="none"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeDasharray={`${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`}
					className="stroke-amber-500"
				/>
			</svg>
		</span>
	);
}
