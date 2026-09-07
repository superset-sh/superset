import { useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuTriangleAlert } from "react-icons/lu";
import type { DashboardSidebarGithubStatus } from "../../types";

interface DashboardSidebarGithubNoticeProps {
	status: DashboardSidebarGithubStatus | null;
}

/**
 * Says why PR chips stopped updating. The host keeps every existing link
 * through a GitHub rate limit, outage, or rejected credential but cannot
 * detect new pull requests, which otherwise reads as "PRs stopped showing
 * up" with nothing to explain it (SUPER-2107).
 */
export function DashboardSidebarGithubNotice({
	status,
}: DashboardSidebarGithubNoticeProps) {
	const { t } = useLingui();
	if (!status) return null;
	const until = formatDateTime(status.until, { timeStyle: "short" });
	const copy = {
		"rate-limited": {
			title: t({ message: "GitHub rate limit reached" }),
			detail: t({
				message: `GitHub is refusing API calls for this machine's credential until ${until}. Existing pull request links stay; new pull requests appear once the limit resets.`,
			}),
		},
		unreachable: {
			title: t({ message: "GitHub unreachable" }),
			detail: t({
				message: `Superset cannot reach api.github.com from this machine. Pull request status retries at ${until}.`,
			}),
		},
		auth: {
			title: t({ message: "GitHub sign-in needed" }),
			detail: t({
				message: `GitHub rejected this machine's credentials, so pull requests cannot be detected. Run "gh auth login" or fix GITHUB_TOKEN; the next retry is at ${until}.`,
			}),
		},
	}[status.reason];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="mx-2 mt-1 flex h-7 items-center gap-2 rounded-md pl-2 pr-1 text-[13px] text-amber-600 dark:text-amber-400">
					<LuTriangleAlert className="size-4 shrink-0" />
					<span className="min-w-0 flex-1 truncate">{copy.title}</span>
				</div>
			</TooltipTrigger>
			<TooltipContent side="right" className="max-w-72 text-wrap-pretty">
				{copy.detail}
			</TooltipContent>
		</Tooltip>
	);
}
