import { Trans, useLingui } from "@lingui/react/macro";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiMiniXMark } from "react-icons/hi2";
import { LuRotateCcw } from "react-icons/lu";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { ACTIVE_WITHIN_MS } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePresenceStack";
import { CloudWorkspaceStatus } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceStatus";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import { CloudWorkspacePullRequestsBadge } from "./components/CloudWorkspacePullRequestsBadge";
import { CloudWorkspaceReposBadge } from "./components/CloudWorkspaceReposBadge";

export interface CloudWorkspaceListItem {
	workspace: Pick<
		CloudWorkspaceRow,
		| "id"
		| "name"
		| "presence"
		| "status"
		| "agentStatus"
		| "agentStatusAt"
		| "createdAt"
		| "createdBy"
	>;
	repos: string[];
	pullRequests: CloudPullRequest[];
	isInSidebar: boolean;
	isMine: boolean;
	/** False while the viewer is the only one present. */
	showsPresence: boolean;
	isRead: boolean;
}

interface CloudWorkspaceListRowProps {
	item: CloudWorkspaceListItem;
	now: Date;
	showCreator: boolean;
	onOpen: () => void;
	onOpenPullRequest: (url: string) => void;
	onOpenRepo: (fullName: string) => void;
	onSetInSidebar: (inSidebar: boolean) => void;
	onUnarchive?: () => void;
}

export function CloudWorkspaceListRow({
	item,
	now,
	showCreator,
	onOpen,
	onOpenPullRequest,
	onOpenRepo,
	onSetInSidebar,
	onUnarchive,
}: CloudWorkspaceListRowProps) {
	const { t } = useLingui();
	const { workspace, repos, pullRequests, isInSidebar } = item;
	const isArchived = workspace.status === "archived";
	const canUnarchive = isArchived && onUnarchive !== undefined;
	return (
		<tr
			onClick={onOpen}
			className="group h-11 cursor-pointer [&:hover>td]:bg-fill-hover [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
		>
			<td className="w-full max-w-0 pr-3 pl-4">
				<span className="flex min-w-0 items-center gap-2">
					{showCreator &&
						(workspace.createdBy ? (
							<AvatarStack
								people={[
									{
										id: workspace.createdBy.userId,
										name: workspace.createdBy.name,
										image: workspace.createdBy.image,
									},
								]}
								size={20}
							/>
						) : (
							<span className="size-5 shrink-0 rounded-full border border-dashed border-muted-foreground" />
						))}
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							onOpen();
						}}
						className={cn(
							"min-w-0 truncate text-left text-sm font-medium focus-visible:underline focus-visible:outline-none",
							isArchived && "text-muted-foreground",
						)}
					>
						{workspace.name}
					</button>
					<span className="flex min-w-0 shrink-[999] items-center gap-2 overflow-hidden">
						<CloudWorkspaceReposBadge repos={repos} onOpenRepo={onOpenRepo} />
						<CloudWorkspacePullRequestsBadge
							pullRequests={pullRequests}
							onOpenPullRequest={onOpenPullRequest}
						/>
					</span>
				</span>
			</td>
			<td className="w-0 pr-3">
				<span className="flex min-w-[50px] justify-end">
					{item.showsPresence && (
						<AvatarStack
							people={workspace.presence.map((person) => ({
								id: person.userId,
								name: person.name,
								image: person.image,
								isActive:
									now.getTime() - person.lastSeenAt.getTime() <
									ACTIVE_WITHIN_MS,
							}))}
							size={20}
						/>
					)}
				</span>
			</td>
			<td className="w-0 pr-3 text-right">
				{isArchived || item.isMine ? null : (
					<span className="inline-grid justify-items-end *:[grid-area:1/1]">
						<Button
							variant="outline"
							size="xs"
							onClick={(event) => {
								event.stopPropagation();
								onSetInSidebar(false);
							}}
							className={cn(
								"gap-1 text-xs whitespace-nowrap transition-none",
								!isInSidebar && "invisible",
							)}
						>
							<HiMiniXMark className="size-3.5" />
							<Trans>Remove from sidebar</Trans>
						</Button>
						<Button
							size="xs"
							onClick={(event) => {
								event.stopPropagation();
								onSetInSidebar(true);
							}}
							className={cn(
								"text-xs whitespace-nowrap transition-none",
								isInSidebar && "invisible",
							)}
						>
							<Trans>Add to sidebar</Trans>
						</Button>
					</span>
				)}
			</td>
			<td className="w-0 pr-4">
				<span className="flex min-w-6 justify-end text-xs whitespace-nowrap text-muted-foreground tabular-nums">
					<span
						className={cn(
							"flex items-center",
							canUnarchive &&
								"group-hover:hidden group-has-[:focus-visible]:hidden",
						)}
					>
						<CloudWorkspaceStatus
							workspace={workspace}
							isRead={item.isRead}
							now={now}
						/>
					</span>
					{canUnarchive && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										onUnarchive?.();
									}}
									aria-label={t({ message: "Unarchive workspace" })}
									className="-mr-[3px] hidden size-5 items-center justify-center rounded text-muted-foreground group-hover:flex group-has-[:focus-visible]:flex hover:bg-foreground/10 hover:text-foreground"
								>
									<LuRotateCcw className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="top">
								<Trans>Unarchive workspace</Trans>
							</TooltipContent>
						</Tooltip>
					)}
				</span>
			</td>
		</tr>
	);
}
