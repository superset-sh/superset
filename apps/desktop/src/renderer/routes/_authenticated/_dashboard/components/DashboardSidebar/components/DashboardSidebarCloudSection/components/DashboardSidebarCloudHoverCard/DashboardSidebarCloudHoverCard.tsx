import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { LuArrowUpRight } from "react-icons/lu";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";
import { CloudWorkspacePersonLink } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePersonLink";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import { CloudPullRequestRow } from "../../../../../CloudPullRequestRow";
import { CloudRepositoryRow } from "../../../../../CloudRepositoryRow";
import { CloudSection } from "../../../../../CloudSection";
import { CloudTaskRow } from "../../../../../CloudTaskRow";

interface DashboardSidebarCloudHoverCardProps {
	workspace: Pick<CloudWorkspaceRow, "name" | "createdAt" | "createdBy">;
	repositories: string[];
	tasks: CloudTask[];
	pullRequests: CloudPullRequest[];
	now: Date;
	onOpenDetails: () => void;
	onOpenPerson: (userId: string) => void;
	onOpenTask: (taskId: string) => void;
	onOpenPullRequest: (url: string) => void;
	onOpenRepository: (fullName: string) => void;
}

export function DashboardSidebarCloudHoverCard({
	workspace,
	repositories,
	tasks,
	pullRequests,
	now,
	onOpenDetails,
	onOpenPerson,
	onOpenTask,
	onOpenPullRequest,
	onOpenRepository,
}: DashboardSidebarCloudHoverCardProps) {
	const { formatCompactRelativeTime } = useFormat();
	const { createdBy: owner } = workspace;
	const createdAgo = formatCompactRelativeTime(workspace.createdAt, now);
	const isEmpty =
		repositories.length === 0 &&
		tasks.length === 0 &&
		pullRequests.length === 0;
	return (
		<div className="group/card">
			<div className="space-y-1.5 px-2 pt-1.5 pb-1">
				<button
					type="button"
					onClick={onOpenDetails}
					className="group/title -mx-1 block max-w-full rounded-sm px-1 text-left focus-visible:bg-fill-hover focus-visible:outline-none"
				>
					<span className="line-clamp-2 text-sm leading-snug font-medium break-words">
						<span className="decoration-muted-foreground/60 underline-offset-2 group-hover/title:underline">
							{workspace.name}
						</span>
						<LuArrowUpRight className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground opacity-0 group-hover/card:opacity-100 group-focus-visible/title:opacity-100 group-hover/title:text-foreground" />
					</span>
				</button>
				<div className="flex items-center gap-1 text-xs text-muted-foreground">
					{owner && (
						<>
							<CloudWorkspacePersonLink
								person={owner}
								avatarSize={16}
								className="-ml-1 min-w-0 font-normal text-muted-foreground hover:text-foreground"
								onOpen={onOpenPerson}
							/>
							<span>·</span>
						</>
					)}
					<span className="shrink-0">
						<Trans>created {createdAgo}</Trans>
					</span>
				</div>
			</div>
			<div className="space-y-4 pt-3 pb-1">
				{repositories.length > 0 && (
					<CloudSection title={<Trans>Repositories</Trans>}>
						{repositories.map((fullName) => (
							<CloudRepositoryRow
								key={fullName}
								fullName={fullName}
								onOpen={() => onOpenRepository(fullName)}
							/>
						))}
					</CloudSection>
				)}
				{tasks.length > 0 && (
					<CloudSection title={<Trans>Tasks</Trans>} scrollable>
						{tasks.map((task) => (
							<CloudTaskRow
								key={task.id}
								task={task}
								onOpen={() => onOpenTask(task.id)}
							/>
						))}
					</CloudSection>
				)}
				{pullRequests.length > 0 && (
					<CloudSection title={<Trans>Pull requests</Trans>} scrollable>
						{pullRequests.map((pullRequest) => (
							<CloudPullRequestRow
								key={pullRequest.url}
								pullRequest={pullRequest}
								onOpen={() => onOpenPullRequest(pullRequest.url)}
							/>
						))}
					</CloudSection>
				)}
				{isEmpty && (
					<div className="px-2 text-xs text-muted-foreground">
						<Trans>No tasks or pull requests yet</Trans>
					</div>
				)}
			</div>
		</div>
	);
}
