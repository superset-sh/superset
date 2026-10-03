import { useLingui } from "@lingui/react/macro";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { cn } from "@superset/ui/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type ReactNode,
} from "react";
import { LuArchive } from "react-icons/lu";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { CloudWorkspaceStatus } from "../../../../../CloudWorkspaceStatus";
import { DashboardSidebarCloudPortsButton } from "./components/DashboardSidebarCloudPortsButton";
import { DashboardSidebarCloudPullRequestButton } from "./components/DashboardSidebarCloudPullRequestButton";

interface DashboardSidebarCloudRowProps
	extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
	workspace: Pick<
		CloudWorkspaceRow,
		| "name"
		| "createdBy"
		| "status"
		| "agentStatus"
		| "agentStatusAt"
		| "createdAt"
	>;
	isMine: boolean;
	isRead: boolean;
	nameSlot?: ReactNode;
	repo: { name: string; iconUrl: string | null } | null;
	ports: {
		count: number;
		card: ReactNode;
		onOpenChange?: (open: boolean) => void;
	} | null;
	pullRequest: Pick<CloudPullRequest, "number" | "state" | "isDraft"> | null;
	now?: Date;
	isActive?: boolean;
	onOpen: () => void;
	onOpenPullRequest: () => void;
	onArchive: () => void;
}

export const DashboardSidebarCloudRow = forwardRef<
	HTMLDivElement,
	DashboardSidebarCloudRowProps
>(
	(
		{
			workspace,
			isMine,
			isRead,
			nameSlot,
			repo,
			ports,
			pullRequest,
			now,
			isActive = false,
			onOpen,
			onOpenPullRequest,
			onArchive,
			className,
			...props
		},
		ref,
	) => {
		const { t } = useLingui();
		const highlighted = isActive;
		const { name, createdBy: owner } = workspace;
		return (
			<div
				ref={ref}
				className={cn(
					"group relative mx-2 flex h-8 items-center rounded-md pr-2 pl-2 text-left text-sm transition-colors",
					highlighted
						? "bg-fill-selected"
						: "hover:bg-fill-hover has-[:focus-visible]:bg-fill-hover",
					className,
				)}
				{...props}
			>
				<button
					type="button"
					onClick={onOpen}
					aria-label={name}
					className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				/>
				<ProjectThumbnail
					projectName={repo?.name ?? name}
					iconUrl={repo?.iconUrl}
					className="pointer-events-none relative mr-2 size-5 rounded-[5px] text-[10px]"
				/>
				<span className="pointer-events-none relative flex min-w-0 flex-1 items-center [&_input]:pointer-events-auto">
					{nameSlot ?? (
						<span
							className={cn(
								"min-w-0 truncate text-[13px] leading-tight",
								highlighted ? "text-foreground" : "text-foreground/80",
							)}
						>
							{name}
						</span>
					)}
					{owner && !isMine && (
						<AvatarStack
							people={[
								{ id: owner.userId, name: owner.name, image: owner.image },
							]}
							size={18}
							className="ml-1.5"
						/>
					)}
				</span>
				<span className="pointer-events-none relative ml-1.5 flex shrink-0 items-center gap-1.5 [&_button]:pointer-events-auto">
					{ports && (
						<DashboardSidebarCloudPortsButton
							count={ports.count}
							card={ports.card}
							onOpenChange={ports.onOpenChange}
						/>
					)}
					{pullRequest && (
						<DashboardSidebarCloudPullRequestButton
							pullRequest={pullRequest}
							onClick={onOpenPullRequest}
						/>
					)}
					<span className="flex h-5 w-6 items-center justify-end">
						<span className="flex items-center group-hover:hidden group-has-[:focus-visible]:hidden">
							<CloudWorkspaceStatus
								workspace={workspace}
								isRead={isRead}
								now={now}
							/>
						</span>
						<button
							type="button"
							onClick={(event) => {
								event.stopPropagation();
								onArchive();
							}}
							aria-label={t({ message: "Archive workspace" })}
							className="hidden size-5 items-center justify-center rounded text-muted-foreground group-hover:flex group-has-[:focus-visible]:flex hover:bg-foreground/10 hover:text-foreground"
						>
							<LuArchive className="size-3.5" />
						</button>
					</span>
				</span>
			</div>
		);
	},
);
